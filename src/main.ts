import { Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ClaudeClient } from "./claude";
import { ProfileManager } from "./profile";
import { buildSystemPrompt } from "./prompts";
import { LifeCompanionSettingTab } from "./settings";
import {
  DEFAULT_SETTINGS,
  type ChatMode,
  type LifeCompanionSettings,
} from "./types";
import { VaultTools } from "./vault-tools";
import type Anthropic from "@anthropic-ai/sdk";

export default class LifeCompanionPlugin extends Plugin {
  settings: LifeCompanionSettings;
  claudeClient: ClaudeClient | null = null;
  vaultTools: VaultTools;
  profileManager: ProfileManager;
  conversationHistory: Anthropic.MessageParam[] = [];

  async onload() {
    await this.loadSettings();

    this.vaultTools = new VaultTools(this.app);
    this.profileManager = new ProfileManager(this.app);

    if (this.settings.apiKey) {
      this.claudeClient = new ClaudeClient(this.settings.apiKey);
    }

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

    // Ensure _life/ folder structure exists
    this.app.workspace.onLayoutReady(async () => {
      await this.profileManager.ensureLifeFolder();
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async activateView() {
    const { workspace } = this.app;
    workspace.detachLeavesOfType(VIEW_TYPE_CHAT);

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async handleMessage(text: string, mode: ChatMode, view: ChatView) {
    if (!this.settings.apiKey) {
      view.addAssistantMessage(
        "Chưa có API key. Vào Settings → Life Companion để nhập API key nhé."
      );
      return;
    }

    if (!this.claudeClient) {
      this.claudeClient = new ClaudeClient(this.settings.apiKey);
    }

    const model = mode === "quick" ? this.settings.quickModel : this.settings.diveModel;

    try {
      const profile = await this.profileManager.getProfile();
      const index = await this.profileManager.getIndex();
      const systemPrompt = buildSystemPrompt(profile, index, mode);

      const streamEl = view.createStreamingMessage();
      let accumulatedText = "";

      const response = await this.claudeClient.sendMessage({
        userMessage: text,
        mode,
        model,
        systemPrompt,
        conversationHistory: this.conversationHistory,
        vaultTools: this.vaultTools,
        onText: (chunk) => {
          accumulatedText += chunk;
          streamEl.textContent = accumulatedText;
          view.scrollToBottom();
        },
        onToolUse: (name, input) => {
          const toolMsg = `🔧 ${name}...`;
          if (!accumulatedText.includes(toolMsg)) {
            accumulatedText += `\n${toolMsg}\n`;
            streamEl.textContent = accumulatedText;
          }
        },
      });

      // Update conversation history
      this.conversationHistory.push(
        { role: "user", content: text },
        { role: "assistant", content: response }
      );

      // Keep history manageable (last 20 messages)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      view.addAssistantMessage(`Lỗi: ${msg}`);
      new Notice(`Life Companion error: ${msg}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.settings.apiKey) {
      if (this.claudeClient) {
        this.claudeClient.updateApiKey(this.settings.apiKey);
      } else {
        this.claudeClient = new ClaudeClient(this.settings.apiKey);
      }
    }
  }
}
