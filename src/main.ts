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

function selectTools(message: string, mode: ChatMode, enabledTools: string[]): ToolDefinition[] {
  const ALL = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...CALENDAR_TOOLS, ...WEB_TOOLS];
  const filterEnabled = (defs: ToolDefinition[]) =>
    defs.filter((t) => enabledTools.includes(t.name));

  // Dive mode: always include all enabled tools for full research capability
  if (mode === "dive") return filterEnabled(ALL);

  // Quick mode: include all non-web tools,
  // only add web tools if message explicitly needs them
  const tools: ToolDefinition[] = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...CALENDAR_TOOLS];

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
      const tools = selectTools(text, conversation.mode, this.settings.enabledTools);

      const response = await this.aiClient.sendMessage({
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
        onToolUse: (name, input) => {
          view.addToolCall(name, input);
          view.scrollToBottom();
        },
        onToolResult: (name, result) => {
          view.completeToolCall(name, result);
        },
      });

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

      // Token-based history trimming
      const estimateTokens = (t: string) => Math.ceil(t.length / 3);
      const limit = MODEL_CONTEXT_LIMITS[conversation.model] || 200000;

      let totalTokens = 500; // system prompt overhead
      for (const msg of conversation.history) {
        totalTokens += estimateTokens(msg.content);
      }

      while (totalTokens > limit * 0.7 && conversation.history.length > 2) {
        const removed = conversation.history.splice(0, 2); // remove oldest pair
        for (const msg of removed) {
          totalTokens -= estimateTokens(msg.content);
        }
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
      const msg = error instanceof Error ? error.message : "Unknown error";
      view.addAssistantMessage(t.error(msg));
      new Notice(`Life Companion: ${msg}`);
    }
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
