import { App, TFile, TFolder } from "obsidian";

// ─── Event types matching Full Calendar frontmatter schema ───

export interface CalendarEvent {
  filePath: string;
  title: string;
  type: "single" | "recurring" | "rrule";
  date?: string;
  endDate?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  completed?: boolean;
  completedDates?: string[];
  daysOfWeek?: (string | number)[];
  startRecur?: string;
  endRecur?: string;
  rrule?: string;
  startDate?: string;
  skipDates?: string[];
}

const DOW_LETTER_MAP: Record<string, number> = {
  U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6,
};

export class CalendarManager {
  constructor(
    private app: App,
    private getSettingsDir?: () => string,
  ) {}

  // ─── Cache Sync ───────────────────────────────────────────

  private waitForFileCache(filePath: string, timeoutMs = 2000): Promise<void> {
    return new Promise<void>((resolve) => {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const existing = this.app.metadataCache.getFileCache(file);
        if (existing?.frontmatter) { resolve(); return; }
      }
      const timer = setTimeout(() => {
        this.app.metadataCache.off("changed", handler);
        resolve();
      }, timeoutMs);
      const handler = (changedFile: TFile) => {
        if (changedFile.path === filePath) {
          const cache = this.app.metadataCache.getFileCache(changedFile);
          if (cache?.frontmatter) {
            clearTimeout(timer);
            this.app.metadataCache.off("changed", handler);
            resolve();
          }
        }
      };
      this.app.metadataCache.on("changed", handler);
    });
  }

  // ─── Detection ──────────────────────────────────────────

  isFullCalendarInstalled(): boolean {
    return (this.app as any).plugins?.enabledPlugins?.has("obsidian-full-calendar") ?? false;
  }

  async getEventsDirectory(): Promise<string | null> {
    try {
      const configPath = ".obsidian/plugins/obsidian-full-calendar/data.json";
      const content = await this.app.vault.adapter.read(configPath);
      const data = JSON.parse(content);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const localSource = data.calendarSources?.find((s: any) => s.type === "local");
      if (localSource?.directory) return localSource.directory;
    } catch {
      // Config not found or unreadable
    }
    return null;
  }

  private async getEventsDir(): Promise<string> {
    const dir = await this.getEventsDirectory();
    if (dir) return dir;
    const fallback = this.getSettingsDir?.();
    if (fallback) return fallback;
    return "calendar";
  }

  // ─── Check Status ───────────────────────────────────────

  async checkCalendarStatus(): Promise<string> {
    const installed = this.isFullCalendarInstalled();
    if (!installed) {
      return "Full Calendar plugin is not installed or not enabled. " +
        "Install it from Obsidian Community Plugins: search 'Full Calendar'. " +
        "Once installed, create a local calendar source with an events directory.";
    }
    const dir = await this.getEventsDirectory();
    if (dir) {
      return `Full Calendar is installed. Events directory: ${dir}`;
    }
    return "Full Calendar is installed but no local calendar source found. " +
      "Configure a local calendar in Full Calendar settings.";
  }

  // ─── Parse Events ───────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseEvent(file: TFile, fm: Record<string, any>): CalendarEvent {
    return {
      filePath: file.path,
      title: fm.title || file.basename,
      type: fm.type || "single",
      date: fm.date,
      endDate: fm.endDate,
      allDay: fm.allDay,
      startTime: fm.startTime,
      endTime: fm.endTime,
      completed: fm.completed,
      completedDates: fm.completedDates,
      daysOfWeek: fm.daysOfWeek,
      startRecur: fm.startRecur,
      endRecur: fm.endRecur,
      rrule: fm.rrule,
      startDate: fm.startDate,
      skipDates: fm.skipDates,
    };
  }

  private async getAllEvents(): Promise<CalendarEvent[]> {
    const dir = await this.getEventsDir();
    const events: CalendarEvent[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(dir + "/")) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm && fm.title) {
        events.push(this.parseEvent(file, fm));
      }
    }
    return events;
  }

  // ─── Date Matching ──────────────────────────────────────

  private eventOccursOnDate(event: CalendarEvent, dateStr: string): boolean {
    const date = new Date(dateStr + "T00:00:00");

    if (event.type === "single") {
      if (!event.date) return false;
      if (event.endDate) return dateStr >= event.date && dateStr <= event.endDate;
      return event.date === dateStr;
    }

    if (event.type === "recurring") {
      if (event.startRecur && dateStr < event.startRecur) return false;
      if (event.endRecur && dateStr > event.endRecur) return false;
      if (!event.daysOfWeek) return false;
      const dow = date.getDay();
      return event.daysOfWeek.some((d) => {
        if (typeof d === "number") return d === dow;
        return DOW_LETTER_MAP[d as string] === dow;
      });
    }

    if (event.type === "rrule") {
      if (event.startDate && dateStr < event.startDate) return false;
      if (event.skipDates?.includes(dateStr)) return false;
      if (event.rrule) {
        return this.matchRrule(event.rrule, event.startDate || event.date || dateStr, dateStr, date);
      }
      return true; // fallback: no rrule string
    }

    return false;
  }

  // ─── RRULE Matching ─────────────────────────────────────

  private static readonly RRULE_DOW_MAP: Record<string, number> = {
    SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
  };

  private matchRrule(rrule: string, startDateStr: string, _dateStr: string, date: Date): boolean {
    const parts: Record<string, string> = {};
    for (const seg of rrule.split(";")) {
      const [k, v] = seg.split("=");
      if (k && v) parts[k] = v;
    }

    const freq = parts["FREQ"];
    const interval = parseInt(parts["INTERVAL"] || "1", 10);
    const start = new Date(startDateStr + "T00:00:00");

    if (freq === "DAILY") {
      if (interval <= 1) return true;
      const diffDays = Math.round((date.getTime() - start.getTime()) / 86400000);
      return diffDays >= 0 && diffDays % interval === 0;
    }

    if (freq === "WEEKLY") {
      // Check BYDAY constraint
      if (parts["BYDAY"]) {
        const allowedDays = parts["BYDAY"].split(",").map((d) => CalendarManager.RRULE_DOW_MAP[d]);
        if (!allowedDays.includes(date.getDay())) return false;
      }
      if (interval <= 1) return true;
      // Check week interval: count weeks since start
      const diffDays = Math.round((date.getTime() - start.getTime()) / 86400000);
      const diffWeeks = Math.floor(diffDays / 7);
      return diffDays >= 0 && diffWeeks % interval === 0;
    }

    if (freq === "MONTHLY") {
      if (parts["BYMONTHDAY"]) {
        if (date.getDate() !== parseInt(parts["BYMONTHDAY"], 10)) return false;
      }
      if (interval <= 1) return true;
      // Check month interval
      const monthDiff = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
      return monthDiff >= 0 && monthDiff % interval === 0;
    }

    return true; // unsupported FREQ — show rather than hide
  }

  /** Resolve completed status for a specific date occurrence */
  private isCompletedOn(event: CalendarEvent, dateStr: string): boolean {
    if (event.type === "single") return !!event.completed;
    return event.completedDates?.includes(dateStr) ?? false;
  }

  /** Create a per-date copy of event with resolved completed state */
  private resolveForDate(event: CalendarEvent, dateStr: string): CalendarEvent {
    if (event.type === "single") return event;
    return { ...event, completed: this.isCompletedOn(event, dateStr) };
  }

  // ─── Tool: get_events ───────────────────────────────────

  async getEvents(date?: string, startDate?: string, endDate?: string): Promise<string> {
    const events = await this.getAllEvents();
    let filtered: CalendarEvent[];

    const queryDate = date || new Date().toISOString().split("T")[0];

    if (date) {
      filtered = events.filter((e) => this.eventOccursOnDate(e, date)).map((e) => this.resolveForDate(e, date));
    } else if (startDate && endDate) {
      filtered = [];
      const cur = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      const seen = new Set<string>();
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0];
        for (const e of events) {
          if (this.eventOccursOnDate(e, ds) && !seen.has(e.filePath)) {
            seen.add(e.filePath);
            filtered.push(this.resolveForDate(e, ds));
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      filtered = events.filter((e) => this.eventOccursOnDate(e, queryDate)).map((e) => this.resolveForDate(e, queryDate));
    }

    if (filtered.length === 0) return "No events found for the specified date/range.";

    return filtered.map((e) => {
      const time = e.allDay ? "All day" : `${e.startTime || "?"}${e.endTime ? " - " + e.endTime : ""}`;
      const status = e.completed ? " [completed]" : "";
      return `- **${e.title}** (${time})${status} — ${e.filePath}`;
    }).join("\n");
  }

  // ─── Tool: get_upcoming_events ──────────────────────────

  async getUpcomingEvents(days: number = 7): Promise<string> {
    const today = new Date();
    const events = await this.getAllEvents();
    const grouped: Record<string, CalendarEvent[]> = {};

    for (let i = 0; i < days; i++) {
      const cur = new Date(today);
      cur.setDate(cur.getDate() + i);
      const ds = cur.toISOString().split("T")[0];
      for (const event of events) {
        if (this.eventOccursOnDate(event, ds)) {
          if (!grouped[ds]) grouped[ds] = [];
          if (!grouped[ds].some((e) => e.filePath === event.filePath)) {
            grouped[ds].push(this.resolveForDate(event, ds));
          }
        }
      }
    }

    const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return `No events in the next ${days} days.`;

    return entries.map(([date, evts]) => {
      const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      });
      const lines = evts.map((e) => {
        const time = e.allDay ? "all day" : `${e.startTime || "?"}${e.endTime ? "-" + e.endTime : ""}`;
        return `  - ${e.title} (${time})`;
      }).join("\n");
      return `**${label} (${date})**\n${lines}`;
    }).join("\n\n");
  }

  // ─── Tool: create_event ─────────────────────────────────

  async createEvent(params: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    endDate?: string;
    type?: "single" | "recurring" | "rrule";
    daysOfWeek?: string[];
    startRecur?: string;
    endRecur?: string;
    rrule?: string;
    body?: string;
  }): Promise<string> {
    const dir = await this.getEventsDir();
    const slug = params.title.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const fileName = `${params.date} ${slug}.md`;
    const filePath = `${dir}/${fileName}`;

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing) return `Event file already exists: ${filePath}. Use update_event instead.`;

    // Create file with empty frontmatter, then use Obsidian's YAML serializer
    const initialContent = "---\n---\n\n" + (params.body || "");

    const folder = this.app.vault.getAbstractFileByPath(dir);
    if (!folder) await this.app.vault.createFolder(dir);

    await this.app.vault.create(filePath, initialContent);

    const createdFile = this.app.vault.getAbstractFileByPath(filePath);
    if (createdFile && createdFile instanceof TFile) {
      await this.app.fileManager.processFrontMatter(createdFile, (fm) => {
        fm.title = params.title;
        fm.type = params.type || "single";

        if (fm.type === "single") {
          fm.date = params.date;
          if (params.endDate) fm.endDate = params.endDate;
          fm.allDay = params.allDay ?? !params.startTime;
          if (params.startTime) fm.startTime = params.startTime;
          if (params.endTime) fm.endTime = params.endTime;
        } else if (fm.type === "recurring") {
          if (params.daysOfWeek) {
            fm.daysOfWeek = params.daysOfWeek.map((d: string) => DOW_LETTER_MAP[d] ?? parseInt(d, 10));
          }
          if (params.startRecur) fm.startRecur = params.startRecur;
          if (params.endRecur) fm.endRecur = params.endRecur;
          if (params.startTime) fm.startTime = params.startTime;
          if (params.endTime) fm.endTime = params.endTime;
          fm.allDay = params.allDay ?? !params.startTime;
        } else if (fm.type === "rrule") {
          if (params.rrule) fm.rrule = params.rrule;
          fm.startDate = params.date;
          if (params.startTime) fm.startTime = params.startTime;
          if (params.endTime) fm.endTime = params.endTime;
        }
      });
    }

    await this.waitForFileCache(filePath);
    return `Created event: ${filePath}`;
  }

  // ─── Tool: update_event ─────────────────────────────────

  async updateEvent(path: string, properties: Record<string, unknown>): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `Event file not found: ${path}`;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [key, value] of Object.entries(properties)) {
        if (value === null || value === undefined) {
          delete fm[key];
        } else {
          fm[key] = value;
        }
      }
    });
    await this.waitForFileCache(path);
    return `Updated event: ${path}`;
  }

  // ─── Tool: complete_event ───────────────────────────────

  async completeEvent(path: string, completed: boolean, date?: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `Event file not found: ${path}`;

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const type = fm.type || "single";

      if (type === "single") {
        if (completed) {
          fm.completed = true;
        } else {
          delete fm.completed;
        }
      } else {
        // Recurring/rrule: track per-date completion
        const dates: string[] = fm.completedDates || [];
        if (completed && date && !dates.includes(date)) {
          dates.push(date);
          fm.completedDates = dates;
        } else if (!completed && date) {
          fm.completedDates = dates.filter((d: string) => d !== date);
          if (fm.completedDates.length === 0) delete fm.completedDates;
        }
      }
    });

    await this.waitForFileCache(path);
    return completed ? `Marked completed: ${path}` : `Marked incomplete: ${path}`;
  }

  // ─── Tool: delete_event ─────────────────────────────────

  async deleteEvent(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `Event file not found: ${path}`;
    await this.app.vault.trash(file, true);
    return `Deleted event: ${path}`;
  }

  // ─── UI: get events for a month ─────────────────────────

  async getEventsForMonth(year: number, month: number): Promise<Map<string, CalendarEvent[]>> {
    const events = await this.getAllEvents();
    const map = new Map<string, CalendarEvent[]>();

    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents: CalendarEvent[] = [];
      for (const event of events) {
        if (this.eventOccursOnDate(event, ds)) dayEvents.push(this.resolveForDate(event, ds));
      }
      if (dayEvents.length > 0) map.set(ds, dayEvents);
    }
    return map;
  }
}
