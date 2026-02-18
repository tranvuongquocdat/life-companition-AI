import * as cron from "node-cron";
import type TelegramBot from "node-telegram-bot-api";
import type { AIClient } from "@life-companion/core";
import type { ServerVaultTools } from "./vault-tools";
import type { ServerCalendarManager } from "./calendar-manager";
import type { ServerConfig } from "./config";

interface ReminderEntry {
  eventId: string;
  eventTitle: string;
  eventTimestamp: number;
  reminders: {
    sendAt: number;
    message: string;
    priority: "high" | "normal";
    sent: boolean;
  }[];
}

const REMINDERS_PATH = "system/reminders.json";

export class Scheduler {
  constructor(
    private config: ServerConfig,
    private bot: TelegramBot,
    private aiClient: AIClient,
    private vaultTools: ServerVaultTools,
    private calendarManager: ServerCalendarManager,
  ) {}

  start() {
    // Morning briefing
    cron.schedule(`0 ${this.config.morningBriefingHour} * * *`, () => {
      this.sendBriefing().catch((e) => console.error("Briefing failed:", e));
    }, { timezone: this.config.timezone });

    // Evening recap
    cron.schedule(`0 ${this.config.eveningRecapHour} * * *`, () => {
      this.sendRecap().catch((e) => console.error("Recap failed:", e));
    }, { timezone: this.config.timezone });

    // Reminder check every minute
    cron.schedule("* * * * *", () => {
      this.checkReminders().catch((e) => console.error("Reminder check failed:", e));
    }, { timezone: this.config.timezone });

    console.log(
      `Scheduler started: briefing@${this.config.morningBriefingHour}h, ` +
      `recap@${this.config.eveningRecapHour}h (${this.config.timezone})`,
    );
  }

  // ─── Morning Briefing ───────────────────────────────────

  private async sendBriefing() {
    const parts: string[] = [];

    try {
      const events = await this.calendarManager.getUpcomingEvents(3);
      if (events && !events.includes("No events")) {
        parts.push(`📅 **Upcoming Events:**\n${events}`);
      }
    } catch {}

    try {
      const tasks = await this.vaultTools.getPendingDailyTasks();
      if (tasks) parts.push(`✅ **Today's Tasks:**\n${tasks}`);
    } catch {}

    try {
      const goals = await this.vaultTools.getGoals();
      if (goals && !goals.includes("No goals")) {
        parts.push(`🎯 **Goals:**\n${goals.slice(0, 400)}`);
      }
    } catch {}

    const briefing = parts.length > 0
      ? `☀️ **Morning Briefing**\n\n${parts.join("\n\n")}`
      : "☀️ Good morning! No events or tasks today.";

    await this.sendMessage(briefing);
  }

  // ─── Evening Recap ──────────────────────────────────────

  private async sendRecap() {
    const today = new Date().toISOString().slice(0, 10);
    const parts: string[] = [];

    try {
      const dailyNote = await this.vaultTools.getDailyNote(today);
      if (dailyNote && !dailyNote.includes("not found")) {
        // Count completed tasks
        const completedCount = (dailyNote.match(/- \[x\]/gi) || []).length;
        const pendingCount = (dailyNote.match(/- \[ \]/g) || []).length;
        if (completedCount > 0 || pendingCount > 0) {
          parts.push(`✅ Tasks: ${completedCount} done, ${pendingCount} pending`);
        }
      }
    } catch {}

    try {
      const events = await this.calendarManager.getEvents(today);
      if (events && !events.includes("No events")) {
        parts.push(`📅 **Today's Events:**\n${events}`);
      }
    } catch {}

    const recap = parts.length > 0
      ? `🌙 **Evening Recap**\n\n${parts.join("\n\n")}`
      : "🌙 Good evening! Have a restful night.";

    await this.sendMessage(recap);
  }

  // ─── AI-Driven Smart Reminders ──────────────────────────

  private async checkReminders() {
    try {
      const raw = await this.vaultTools.readNote(REMINDERS_PATH).catch(() => "[]");
      if (raw.startsWith("File not found")) return; // No reminders file yet
      const entries: ReminderEntry[] = JSON.parse(raw);
      const now = Date.now();
      let changed = false;

      for (const entry of entries) {
        for (const r of entry.reminders) {
          if (!r.sent && r.sendAt <= now) {
            const emoji = r.priority === "high" ? "🔴" : "🔔";
            await this.sendMessage(`${emoji} ${r.message}`);
            r.sent = true;
            changed = true;
          }
        }
      }

      if (changed) {
        // Clean up: keep entries that have unsent reminders or future events
        const active = entries.filter((e) =>
          e.reminders.some((r) => !r.sent) || e.eventTimestamp > now,
        );
        await this.vaultTools.writeNote(REMINDERS_PATH, JSON.stringify(active, null, 2));
      }
    } catch (e) {
      // Silent fail — no reminders file or parse error is ok
    }
  }

  /** Called externally when a new event is created */
  async planRemindersForEvent(event: {
    title: string;
    date: string;
    startTime?: string;
    location?: string;
    description?: string;
  }) {
    try {
      const prompt = `You are a reminder planner. Given this event, decide WHEN and HOW to remind the user.
Consider: event importance, preparation needed, travel time, time of day.

Event: ${event.title}
Date: ${event.date} ${event.startTime || "all day"}
Location: ${event.location || "none"}

Return ONLY a JSON array, no other text:
[{ "beforeMinutes": number, "message": "reminder message in Vietnamese", "priority": "high"|"normal" }]

Examples:
- Doctor 2pm → [{ "beforeMinutes": 1440, "message": "Ngày mai có lịch khám bác sĩ lúc 2pm", "priority": "high" }, { "beforeMinutes": 60, "message": "Lịch khám bác sĩ trong 1 tiếng nữa", "priority": "high" }]
- Coffee 3pm → [{ "beforeMinutes": 30, "message": "Gặp bạn lúc 3pm — 30 phút nữa", "priority": "normal" }]`;

      const response = await this.aiClient.summarize(
        prompt,
        "Return valid JSON only.",
        "claude",
        this.config.defaultModel,
      );

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.text.trim();
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("Failed to parse reminder plan:", jsonStr);
        return;
      }
      jsonStr = jsonMatch[0];
      const reminders = JSON.parse(jsonStr);

      const eventTime = new Date(`${event.date}T${event.startTime || "00:00"}`).getTime();
      const entry: ReminderEntry = {
        eventId: `${event.date}-${event.title}`,
        eventTitle: event.title,
        eventTimestamp: eventTime,
        reminders: reminders.map((r: { beforeMinutes: number; message: string; priority: string }) => ({
          sendAt: eventTime - r.beforeMinutes * 60000,
          message: r.message,
          priority: r.priority || "normal",
          sent: false,
        })),
      };

      // Filter out reminders that are already past
      entry.reminders = entry.reminders.filter((r) => r.sendAt > Date.now());

      if (entry.reminders.length === 0) return;

      // Load existing reminders, remove old for same event, add new
      const raw = await this.vaultTools.readNote(REMINDERS_PATH).catch(() => "[]");
      const existing: ReminderEntry[] = raw.startsWith("File not found") ? [] : JSON.parse(raw);
      const filtered = existing.filter((e) => e.eventId !== entry.eventId);
      filtered.push(entry);
      await this.vaultTools.writeNote(REMINDERS_PATH, JSON.stringify(filtered, null, 2));

      console.log(`Planned ${entry.reminders.length} reminders for: ${event.title}`);
    } catch (e) {
      console.error("Failed to plan reminders:", e);
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private async sendMessage(text: string) {
    const chatId = Number(this.config.telegramChatId);
    await this.bot.sendMessage(chatId, text, { parse_mode: "Markdown" })
      .catch(() => this.bot.sendMessage(chatId, text));
  }
}
