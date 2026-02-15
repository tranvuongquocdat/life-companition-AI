import { Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ChatHistory } from "./chat-history";
import { AIClient } from "./ai-client";
import { ProfileManager } from "./profile";
import { buildSystemPrompt } from "./prompts";
import { LifeCompanionSettingTab } from "./settings";
import { refreshFromClaudeCode } from "./auth";
import {
  DEFAULT_SETTINGS,
  MODEL_CONTEXT_LIMITS,
  SUMMARIZE_MODEL_PREFERENCE,
  getEffectiveModelGroups,
  getProvider,
  type AIProvider,
  type Attachment,
  type ChatMode,
  type ConversationState,
  type LifeCompanionSettings,
  type SavedConversation,
} from "./types";
import { VaultTools } from "./vault-tools";
import { CalendarManager } from "./calendar-manager";
import { VAULT_TOOLS, WEB_TOOLS, KNOWLEDGE_TOOLS, GRAPH_TOOLS, TASK_TOOLS, DAILY_TOOLS, CALENDAR_TOOLS, type ToolDefinition } from "./tool-definitions";
import { getI18n } from "./i18n";

/** Tools that create/modify vault content — used for hallucination detection */
const WRITE_TOOLS = new Set([
  "write_note", "append_note", "move_note",
  "create_daily_note", "update_properties",
  "create_event", "update_event", "delete_event",
]);

/** Pattern to detect when AI claims it wrote/created something */
const WRITE_CLAIM_PATTERN = /(?:Đã (?:tạo|lưu|cập nhật|ghi|thêm|viết|sửa|di chuyển|xóa)|(?:Created|Saved|Updated|Written|Moved|Deleted|Added) (?:note|event|file|entry|daily))/i;

function selectTools(message: string, mode: ChatMode, enabledTools: string[], calendarAvailable: boolean): ToolDefinition[] {
  const calendarTools = calendarAvailable ? CALENDAR_TOOLS : [];
  const ALL = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...calendarTools, ...WEB_TOOLS];
  const filterEnabled = (defs: ToolDefinition[]) =>
    defs.filter((t) => enabledTools.includes(t.name));

  // Dive mode: always include all enabled tools for full research capability
  if (mode === "dive") return filterEnabled(ALL);

  // Quick mode: include all non-web tools,
  // only add web tools if message explicitly needs them
  const tools: ToolDefinition[] = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...calendarTools];

  const webHint = /\b(web|google|tra cứu|research|internet|url|http|website|trang web|tìm trên mạng|online|fetch|search online|search web)\b/i;
  if (webHint.test(message)) tools.push(...WEB_TOOLS);

  return filterEnabled(tools);
}

export default class LifeCompanionPlugin extends Plugin {
  settings: LifeCompanionSettings;
  aiClient: AIClient;
  vaultTools: VaultTools;
  calendarManager: CalendarManager;
  profileManager: ProfileManager;

  async onload() {
    await this.loadSettings();

    this.vaultTools = new VaultTools(this.app);
    this.calendarManager = new CalendarManager(this.app, () => this.settings.calendarEventsDirectory);
    this.profileManager = new ProfileManager(this.app);
    this.initAIClient();

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-circle", "Life Companion", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-chat",
      name: "Open Life Companion",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new LifeCompanionSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      await this.profileManager.ensureLifeFolder();
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  private initAIClient() {
    this.aiClient = new AIClient({
      claudeAccessToken: this.settings.accessToken,
      claudeApiKey: this.settings.claudeApiKey,
      openaiApiKey: this.settings.openaiApiKey,
      geminiApiKey: this.settings.geminiApiKey,
      groqApiKey: this.settings.groqApiKey,
    });
  }

  private async ensureValidClaudeToken(): Promise<boolean> {
    if (!this.settings.accessToken) return true;

    // Re-read from Claude Code Keychain if token expires within 5 minutes
    if (Date.now() > this.settings.tokenExpiresAt - 5 * 60 * 1000) {
      try {
        const tokens = refreshFromClaudeCode();
        this.settings.accessToken = tokens.accessToken;
        this.settings.refreshToken = tokens.refreshToken;
        this.settings.tokenExpiresAt = tokens.expiresAt;
        await this.saveData(this.settings);
        this.initAIClient();
      } catch (error) {
        new Notice(getI18n(this.settings.language).tokenExpired);
        this.settings.accessToken = "";
        this.settings.refreshToken = "";
        await this.saveData(this.settings);
        return false;
      }
    }
    return true;
  }

  hasCredentialsFor(provider: string): boolean {
    switch (provider) {
      case "claude":
        return !!(this.settings.accessToken || this.settings.claudeApiKey);
      case "openai":
        return !!this.settings.openaiApiKey;
      case "gemini":
        return !!this.settings.geminiApiKey;
      case "groq":
        return !!this.settings.groqApiKey;
      default:
        return false;
    }
  }

  saveConversation(conv: ConversationState) {
    const saved = this.settings.savedConversations;
    const existing = saved.findIndex((c) => c.id === conv.id);
    const entry = {
      id: conv.id,
      title: conv.title,
      messages: conv.messages.slice(-100), // keep last 100 messages
      mode: conv.mode,
      model: conv.model,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      totalInputTokens: conv.totalInputTokens || 0,
      totalOutputTokens: conv.totalOutputTokens || 0,
    };
    if (existing >= 0) {
      saved[existing] = entry;
    } else {
      saved.push(entry);
    }
    // Keep only last 20 conversations — also clean orphaned tabs
    while (saved.length > 20) {
      const removed = saved.shift();
      if (removed) {
        const tabIdx = this.settings.openTabs.indexOf(removed.id);
        if (tabIdx >= 0) this.settings.openTabs.splice(tabIdx, 1);
      }
    }
    this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;

    // Toggle: if already open, close it
    const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      existing.forEach((leaf) => leaf.detach());
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  resolveProvider(model: string): AIProvider {
    // Check effective model groups first (handles dynamic/fetched models)
    const groups = getEffectiveModelGroups(this.settings.customModels);
    for (const group of groups) {
      if (group.models.some((m) => m.id === model)) return group.provider;
    }
    // Fallback to pattern matching for known prefixes
    return getProvider(model);
  }

  async handleMessage(text: string, conversation: ConversationState, view: ChatView, attachments?: Attachment[]) {
    const t = getI18n(this.settings.language);
    const provider = this.resolveProvider(conversation.model);

    if (!this.hasCredentialsFor(provider)) {
      view.addAssistantMessage(t.noApiKey(provider));
      return;
    }

    if (provider === "claude" && this.settings.accessToken) {
      if (!(await this.ensureValidClaudeToken())) {
        view.addAssistantMessage(t.tokenExpired);
        return;
      }
    }

    try {
      const profile = await this.profileManager.getProfile();
      const index = await this.profileManager.getIndex();
      const systemPrompt = buildSystemPrompt(profile, index, conversation.mode);

      view.startThinking();
      const streamEl = view.createStreamingMessage();
      let accumulatedText = "";
      let thinkingStopped = false;
      const calendarAvailable = this.calendarManager.isFullCalendarInstalled();
      const tools = selectTools(text, conversation.mode, this.settings.enabledTools, calendarAvailable);
      const writeToolResults = new Map<string, boolean>(); // name → succeeded

      const aiResponse = await this.aiClient.sendMessage({
        userMessage: text,
        mode: conversation.mode,
        model: conversation.model,
        provider,
        systemPrompt,
        conversationHistory: conversation.history,
        vaultTools: this.vaultTools,
        calendarManager: this.calendarManager,
        tools,
        attachments: attachments || [],
        onText: (chunk) => {
          if (!thinkingStopped) {
            view.stopThinking();
            thinkingStopped = true;
          }
          accumulatedText += chunk;
          view.renderMarkdown(streamEl, accumulatedText);
          view.scrollToBottom();
        },
        onThinking: (thinkingText) => {
          view.addThinkingContent(thinkingText);
          view.scrollToBottom();
        },
        onToolUse: (name, input) => {
          view.addToolCall(name, input);
          view.scrollToBottom();
        },
        onToolResult: (name, result) => {
          view.completeToolCall(name, result);
          if (WRITE_TOOLS.has(name)) {
            const succeeded = !result.startsWith("Error") && !result.includes("not available");
            writeToolResults.set(name, succeeded);
          }
        },
      });
      let response = aiResponse.text;
      view.stopStreaming();

      // ─── Hallucination detection: warn if AI claims writes without successful tool calls ───
      const hasSuccessfulWrite = [...writeToolResults.values()].some(v => v);
      if (!hasSuccessfulWrite && WRITE_CLAIM_PATTERN.test(response)) {
        const warning = this.settings.language === "vi"
          ? "\n\n⚠️ *Lưu ý: Mình chưa thực sự lưu/tạo gì thành công. Nếu bạn muốn lưu, hãy nhắc lại nhé!*"
          : "\n\n⚠️ *Note: I didn't successfully save/create anything. If you want me to save, please ask again!*";
        response += warning;
        accumulatedText += warning;
        view.renderMarkdown(streamEl, accumulatedText);
      }

      if (!thinkingStopped) {
        view.stopThinking();
      }

      // Record assistant message in conversation for persistence
      conversation.messages.push({
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      });

      // Enrich history with attachment context (text content inline, others as labels)
      let historyContent = text;
      if (attachments && attachments.length > 0) {
        const textAtts = attachments.filter((a) => a.type === "text");
        if (textAtts.length > 0) {
          historyContent += "\n\n" + textAtts.map((a) => `[File: ${a.name}]\n${a.data}`).join("\n\n");
        }
        const nonTextAtts = attachments.filter((a) => a.type !== "text");
        if (nonTextAtts.length > 0) {
          historyContent += "\n\n[Attached: " + nonTextAtts.map((a) => a.name).join(", ") + "]";
        }
      }
      conversation.history.push(
        { role: "user", content: historyContent },
        { role: "assistant", content: response }
      );

      // Track actual token usage
      conversation.totalInputTokens = (conversation.totalInputTokens || 0) + aiResponse.usage.inputTokens;
      conversation.totalOutputTokens = (conversation.totalOutputTokens || 0) + aiResponse.usage.outputTokens;
      conversation.lastKnownInputTokens = aiResponse.usage.inputTokens;
      conversation.lastCacheReadTokens = aiResponse.usage.cacheReadInputTokens || 0;
      conversation.lastCacheCreationTokens = aiResponse.usage.cacheCreationInputTokens || 0;

      // ─── Context management: auto-summarize or hard-trim ──────────
      const limit = MODEL_CONTEXT_LIMITS[conversation.model] || 200000;
      const currentContext = aiResponse.usage.inputTokens > 0
        ? aiResponse.usage.inputTokens
        : this.estimateHistoryTokens(conversation);

      if (currentContext > limit * 0.6 && conversation.history.length > 6) {
        await this.autoSummarize(conversation, provider);
      } else if (currentContext > limit * 0.85 && conversation.history.length > 2) {
        this.hardTrimHistory(conversation, limit);
      }

      const chatHistory = new ChatHistory(this.app);
      await chatHistory.saveMessage({ role: "user", content: text, timestamp: Date.now() });
      await chatHistory.saveMessage({
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      });
    } catch (error) {
      view.stopThinking();
      view.stopStreaming();
      const msg = error instanceof Error ? error.message : "Unknown error";
      view.addAssistantMessage(t.error(msg));
      new Notice(`Life Companion: ${msg}`);
    }
  }

  // ─── Context management helpers ──────────────────────────────────

  private estimateHistoryTokens(conversation: ConversationState): number {
    let total = 500;
    for (const msg of conversation.history) {
      total += Math.ceil(msg.content.length / 3);
    }
    return total;
  }

  private hardTrimHistory(conversation: ConversationState, limit: number) {
    const est = (t: string) => Math.ceil(t.length / 3);
    let total = 500;
    for (const msg of conversation.history) total += est(msg.content);
    while (total > limit * 0.7 && conversation.history.length > 2) {
      const removed = conversation.history.splice(0, 2);
      for (const msg of removed) total -= est(msg.content);
    }
  }

  private async autoSummarize(conversation: ConversationState, currentProvider: AIProvider) {
    const keepRecent = 4; // keep last 2 exchanges
    if (conversation.history.length <= keepRecent + 2) return;

    const toSummarize = conversation.history.slice(0, conversation.history.length - keepRecent);

    const target = this.getSummarizeModel(currentProvider);
    if (!target) {
      const limit = MODEL_CONTEXT_LIMITS[conversation.model] || 200000;
      this.hardTrimHistory(conversation, limit);
      return;
    }

    try {
      const { SUMMARIZE_PROMPT } = await import("./prompts");
      const conversationText = toSummarize
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const summaryResponse = await this.aiClient.summarize(
        conversationText, SUMMARIZE_PROMPT, target.provider, target.model,
      );

      const recent = conversation.history.slice(conversation.history.length - keepRecent);
      conversation.history = [
        { role: "assistant", content: `[Context Summary]\n${summaryResponse.text}` },
        ...recent,
      ];

      conversation.totalInputTokens = (conversation.totalInputTokens || 0) + summaryResponse.usage.inputTokens;
      conversation.totalOutputTokens = (conversation.totalOutputTokens || 0) + summaryResponse.usage.outputTokens;
    } catch (error) {
      console.warn("Auto-summarize failed, falling back to trim:", error);
      const limit = MODEL_CONTEXT_LIMITS[conversation.model] || 200000;
      this.hardTrimHistory(conversation, limit);
    }
  }

  private getSummarizeModel(currentProvider: AIProvider): { model: string; provider: AIProvider } | null {
    if (this.hasCredentialsFor(currentProvider)) {
      const prefs = SUMMARIZE_MODEL_PREFERENCE[currentProvider];
      if (prefs.length > 0) return { model: prefs[0], provider: currentProvider };
    }
    for (const p of ["groq", "gemini", "openai", "claude"] as AIProvider[]) {
      if (p === currentProvider || !this.hasCredentialsFor(p)) continue;
      const prefs = SUMMARIZE_MODEL_PREFERENCE[p];
      if (prefs.length > 0) return { model: prefs[0], provider: p };
    }
    return null;
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    // Migrate old apiKey → claudeApiKey
    if (loaded?.apiKey && !this.settings.claudeApiKey) {
      this.settings.claudeApiKey = loaded.apiKey;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.initAIClient();
    // Refresh model dropdown in any open ChatView
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)) {
      (leaf.view as ChatView).refreshModels();
    }
  }
}
