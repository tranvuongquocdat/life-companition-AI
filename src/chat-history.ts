import { App, TFile } from "obsidian";
import type { ChatMessage } from "./types";

export class ChatHistory {
  constructor(private app: App) {}

  private getTodayPath(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    return `system/chats/${date}.md`;
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    const path = this.getTodayPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    const time = new Date(message.timestamp).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const prefix = message.role === "user" ? "**Bạn**" : "**AI**";
    const line = `\n\n${prefix} (${time}):\n${message.content}`;

    if (file && file instanceof TFile) {
      await this.app.vault.append(file, line);
    } else {
      const header = `# Chat — ${new Date().toISOString().split("T")[0]}\n`;
      await this.app.vault.create(path, header + line);
    }
  }

  async loadTodayHistory(): Promise<string | null> {
    const path = this.getTodayPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }
}
