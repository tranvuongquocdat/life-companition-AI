import TelegramBot from "node-telegram-bot-api";
import {
  AIClient,
  buildSystemPrompt,
  getProvider,
  getI18n,
  VAULT_TOOLS, WEB_TOOLS, KNOWLEDGE_TOOLS, GRAPH_TOOLS,
  TASK_TOOLS, DAILY_TOOLS, CALENDAR_TOOLS, MEMORY_TOOLS,
  type ConversationState,
  type ChatMode,
  type ToolDefinition,
} from "@life-companion/core";
import type { ServerConfig } from "./config";
import type { ServerVaultTools } from "./vault-tools";
import type { ServerCalendarManager } from "./calendar-manager";

export class TelegramBotHandler {
  private bot: TelegramBot;
  private conversation: ConversationState;
  private processing = false;

  constructor(
    private config: ServerConfig,
    private aiClient: AIClient,
    private vaultTools: ServerVaultTools,
    private calendarManager: ServerCalendarManager,
    private toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>,
  ) {
    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    this.bot.on("polling_error", (error) => {
      console.error("Telegram polling error:", (error as Error).message);
    });
    this.conversation = this.newConversation();
    this.setupHandlers();
  }

  getBot(): TelegramBot {
    return this.bot;
  }

  private newConversation(): ConversationState {
    return {
      id: Date.now().toString(),
      title: "Telegram Chat",
      messages: [],
      history: [],
      mode: this.config.chatMode,
      model: this.config.defaultModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  private setupHandlers() {
    this.bot.onText(/\/start/, (msg: TelegramBot.Message) => {
      if (msg.chat.id.toString() !== this.config.telegramChatId) return;
      this.bot.sendMessage(msg.chat.id, "Life Companition AI bot is active! Send me any message to chat.");
    });

    this.bot.onText(/\/new/, (msg: TelegramBot.Message) => {
      if (msg.chat.id.toString() !== this.config.telegramChatId) return;
      this.conversation = this.newConversation();
      this.bot.sendMessage(msg.chat.id, "New conversation started.");
    });

    this.bot.onText(/\/today/, async (msg: TelegramBot.Message) => {
      if (msg.chat.id.toString() !== this.config.telegramChatId) return;
      const briefing = await this.generateBriefing();
      await this.sendLongMessage(msg.chat.id.toString(), briefing);
    });

    this.bot.onText(/\/mode\s+(.+)/, (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
      if (msg.chat.id.toString() !== this.config.telegramChatId) return;
      const mode = match?.[1]?.trim() as ChatMode;
      if (mode === "quick" || mode === "dive") {
        this.config.chatMode = mode;
        this.conversation.mode = mode;
        this.bot.sendMessage(msg.chat.id, `Mode: ${mode}`);
      } else {
        this.bot.sendMessage(msg.chat.id, "Usage: /mode quick or /mode dive");
      }
    });

    this.bot.on("message", (msg: TelegramBot.Message) => {
      // Skip command messages (already handled above)
      if (msg.text?.startsWith("/")) return;
      this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id.toString();
    if (chatId !== this.config.telegramChatId) return;

    const text = msg.text;
    if (!text) return;

    if (this.processing) {
      await this.bot.sendMessage(Number(chatId), "Still processing previous message...");
      return;
    }

    this.processing = true;
    // Send typing indicator
    await this.bot.sendChatAction(Number(chatId), "typing").catch(() => {});

    try {
      const profile = await this.vaultTools.readNote("system/profile.md").catch(() => "");
      const index = await this.vaultTools.readNote("system/index.md").catch(() => "");
      const briefingContext = await this.buildBriefingContext();
      const preferencesContext = await this.vaultTools.getPreferenceContext();
      const systemPrompt = buildSystemPrompt(
        profile, index, this.conversation.mode, briefingContext, preferencesContext,
      );

      const tools = this.selectTools(text);

      let fullResponse = "";
      const response = await this.aiClient.sendMessage({
        userMessage: text,
        mode: this.conversation.mode,
        model: this.conversation.model,
        provider: getProvider(this.conversation.model),
        systemPrompt,
        conversationHistory: this.conversation.history,
        toolExecutor: this.toolExecutor,
        tools,
        onText: (chunk) => { fullResponse += chunk; },
        onThinking: () => {},
        onToolUse: () => {},
        onToolResult: () => {},
      });

      // Update conversation history
      this.conversation.history.push({ role: "user", content: text });
      this.conversation.history.push({ role: "assistant", content: fullResponse });
      this.conversation.totalInputTokens += response.usage.inputTokens;
      this.conversation.totalOutputTokens += response.usage.outputTokens;
      this.conversation.updatedAt = Date.now();

      // Trim history if too long (keep last 40 messages)
      if (this.conversation.history.length > 40) {
        this.conversation.history = this.conversation.history.slice(-40);
      }

      await this.sendLongMessage(chatId, fullResponse || "No response generated.");
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error("Telegram message error:", errMsg);
      await this.bot.sendMessage(Number(chatId), `Error: ${errMsg.slice(0, 200)}`).catch(() => {});
    } finally {
      this.processing = false;
    }
  }

  private selectTools(message: string): ToolDefinition[] {
    const ALL = [
      ...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS,
      ...TASK_TOOLS, ...DAILY_TOOLS, ...CALENDAR_TOOLS,
      ...MEMORY_TOOLS, ...WEB_TOOLS,
    ];

    if (this.conversation.mode === "dive") return ALL;

    // Quick mode: include tools based on message content
    const msgLower = message.toLowerCase();
    const tools: ToolDefinition[] = [...VAULT_TOOLS, ...MEMORY_TOOLS];

    if (msgLower.match(/search|tìm|web|google|internet/)) tools.push(...WEB_TOOLS);
    if (msgLower.match(/tag|nhãn|label/)) tools.push(...KNOWLEDGE_TOOLS);
    if (msgLower.match(/task|todo|việc|công việc|nhiệm vụ/)) tools.push(...TASK_TOOLS);
    if (msgLower.match(/calendar|lịch|event|sự kiện|hẹn/)) tools.push(...CALENDAR_TOOLS);
    if (msgLower.match(/daily|hôm nay|ngày/)) tools.push(...DAILY_TOOLS);
    if (msgLower.match(/link|backlink|graph/)) tools.push(...GRAPH_TOOLS);

    // Deduplicate
    const seen = new Set<string>();
    return tools.filter((t) => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }

  async buildBriefingContext(): Promise<string> {
    const parts: string[] = [];
    try {
      const events = await this.calendarManager.getUpcomingEvents(3);
      if (events && !events.includes("No events")) {
        parts.push(`### Upcoming Events (3 days)\n${events}`);
      }
    } catch { /* no calendar */ }
    try {
      const memories = await this.vaultTools.getRecentMemories(10);
      if (memories && !memories.startsWith("No memories")) {
        parts.push(`### Recent Memories\n${memories}`);
      }
    } catch { /* no memories */ }
    try {
      const tasks = await this.vaultTools.getPendingDailyTasks();
      if (tasks) parts.push(`### Today's Pending Tasks\n${tasks}`);
    } catch { /* no tasks */ }
    try {
      const goals = await this.vaultTools.getGoals();
      if (goals && !goals.includes("No goals file")) {
        parts.push(`### Goals\n${goals.length > 600 ? goals.slice(0, 600) + "\n..." : goals}`);
      }
    } catch { /* no goals */ }
    return parts.join("\n\n");
  }

  async generateBriefing(): Promise<string> {
    const parts: string[] = [];
    try {
      const events = await this.calendarManager.getUpcomingEvents(3);
      if (events && !events.includes("No events")) parts.push(`📅 **Upcoming Events:**\n${events}`);
    } catch {}
    try {
      const tasks = await this.vaultTools.getPendingDailyTasks();
      if (tasks) parts.push(`✅ **Today's Tasks:**\n${tasks}`);
    } catch {}
    try {
      const goals = await this.vaultTools.getGoals();
      if (goals && !goals.includes("No goals")) parts.push(`🎯 **Goals:**\n${goals.slice(0, 400)}`);
    } catch {}

    return parts.length > 0
      ? `☀️ **Daily Briefing**\n\n${parts.join("\n\n")}`
      : "☀️ Good morning! No events or tasks today.";
  }

  async sendLongMessage(chatId: string, text: string) {
    const MAX = 4000;
    if (text.length <= MAX) {
      await this.bot.sendMessage(Number(chatId), text, { parse_mode: "Markdown" })
        .catch(() => this.bot.sendMessage(Number(chatId), text));
      return;
    }
    // Split on paragraph boundaries
    const chunks: string[] = [];
    let current = "";
    for (const line of text.split("\n")) {
      if ((current + "\n" + line).length > MAX) {
        if (current) chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);
    for (const chunk of chunks) {
      await this.bot.sendMessage(Number(chatId), chunk, { parse_mode: "Markdown" })
        .catch(() => this.bot.sendMessage(Number(chatId), chunk));
    }
  }
}
