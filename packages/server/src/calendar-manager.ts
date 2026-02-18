import { readFile, writeFile, readdir, unlink, mkdir, access } from "fs/promises";
import { join, basename } from "path";
import matter from "gray-matter";

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

const RRULE_DOW_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export class ServerCalendarManager {
  private eventsDir: string;

  constructor(private vaultPath: string, eventsDir = "events") {
    this.eventsDir = eventsDir;
  }

  private resolve(p: string): string {
    const resolved = join(this.vaultPath, p);
    if (!resolved.startsWith(this.vaultPath + "/") && resolved !== this.vaultPath) {
      throw new Error(`Path traversal blocked: ${p}`);
    }
    return resolved;
  }

  private async dirExists(p: string): Promise<boolean> {
    try {
      await access(this.resolve(p));
      return true;
    } catch {
      return false;
    }
  }

  // ─── Check Status ───────────────────────────────────────

  async checkCalendarStatus(): Promise<string> {
    const exists = await this.dirExists(this.eventsDir);
    if (exists) {
      return `Calendar is active. Events directory: ${this.eventsDir}`;
    }
    return `Events directory "${this.eventsDir}" not found. Use create_event to auto-create it.`;
  }

  // ─── Parse Events ───────────────────────────────────────

  private parseEvent(filePath: string, fm: Record<string, unknown>): CalendarEvent {
    const name = basename(filePath, ".md");
    return {
      filePath,
      title: (fm.title as string) || name,
      type: (fm.type as CalendarEvent["type"]) || "single",
      date: fm.date as string | undefined,
      endDate: fm.endDate as string | undefined,
      allDay: fm.allDay as boolean | undefined,
      startTime: fm.startTime as string | undefined,
      endTime: fm.endTime as string | undefined,
      completed: fm.completed as boolean | undefined,
      completedDates: fm.completedDates as string[] | undefined,
      daysOfWeek: fm.daysOfWeek as (string | number)[] | undefined,
      startRecur: fm.startRecur as string | undefined,
      endRecur: fm.endRecur as string | undefined,
      rrule: fm.rrule as string | undefined,
      startDate: fm.startDate as string | undefined,
      skipDates: fm.skipDates as string[] | undefined,
    };
  }

  private async getAllEvents(): Promise<CalendarEvent[]> {
    const dirPath = this.resolve(this.eventsDir);
    const events: CalendarEvent[] = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const filePath = `${this.eventsDir}/${entry.name}`;
        try {
          const content = await readFile(join(dirPath, entry.name), "utf8");
          const { data } = matter(content);
          if (data.title) {
            events.push(this.parseEvent(filePath, data));
          }
        } catch { /* skip unparseable files */ }
      }
    } catch { /* directory doesn't exist */ }
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
      return true;
    }

    return false;
  }

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
      if (parts["BYDAY"]) {
        const allowedDays = parts["BYDAY"].split(",").map((d) => RRULE_DOW_MAP[d]);
        if (!allowedDays.includes(date.getDay())) return false;
      }
      if (interval <= 1) return true;
      const diffDays = Math.round((date.getTime() - start.getTime()) / 86400000);
      const diffWeeks = Math.floor(diffDays / 7);
      return diffDays >= 0 && diffWeeks % interval === 0;
    }

    if (freq === "MONTHLY") {
      if (parts["BYMONTHDAY"]) {
        if (date.getDate() !== parseInt(parts["BYMONTHDAY"], 10)) return false;
      }
      if (interval <= 1) return true;
      const monthDiff = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
      return monthDiff >= 0 && monthDiff % interval === 0;
    }

    return true;
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
    const slug = params.title.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const fileName = `${params.date} ${slug}.md`;
    const filePath = `${this.eventsDir}/${fileName}`;
    const fullPath = this.resolve(filePath);

    try {
      await access(fullPath);
      return `Event file already exists: ${filePath}. Use update_event instead.`;
    } catch { /* file doesn't exist — good */ }

    // Build frontmatter
    const fm: Record<string, unknown> = {
      title: params.title,
      type: params.type || "single",
    };

    const eventType = fm.type as string;

    if (eventType === "single") {
      fm.date = params.date;
      if (params.endDate) fm.endDate = params.endDate;
      fm.allDay = params.allDay ?? !params.startTime;
      if (params.startTime) fm.startTime = params.startTime;
      if (params.endTime) fm.endTime = params.endTime;
    } else if (eventType === "recurring") {
      if (params.daysOfWeek) {
        fm.daysOfWeek = params.daysOfWeek.map((d: string) => DOW_LETTER_MAP[d] ?? parseInt(d, 10));
      }
      if (params.startRecur) fm.startRecur = params.startRecur;
      if (params.endRecur) fm.endRecur = params.endRecur;
      if (params.startTime) fm.startTime = params.startTime;
      if (params.endTime) fm.endTime = params.endTime;
      fm.allDay = params.allDay ?? !params.startTime;
    } else if (eventType === "rrule") {
      if (params.rrule) fm.rrule = params.rrule;
      fm.startDate = params.date;
      if (params.startTime) fm.startTime = params.startTime;
      if (params.endTime) fm.endTime = params.endTime;
    }

    const content = matter.stringify(params.body || "", fm);
    await mkdir(this.resolve(this.eventsDir), { recursive: true });
    await writeFile(fullPath, content, "utf8");

    return `Created event: ${filePath}`;
  }

  // ─── Tool: update_event ─────────────────────────────────

  async updateEvent(path: string, properties: Record<string, unknown>): Promise<string> {
    const fullPath = this.resolve(path);
    let content: string;
    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      return `Event file not found: ${path}`;
    }

    const parsed = matter(content);
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined) {
        delete parsed.data[key];
      } else {
        parsed.data[key] = value;
      }
    }

    const updated = matter.stringify(parsed.content, parsed.data);
    await writeFile(fullPath, updated, "utf8");
    return `Updated event: ${path}`;
  }

  // ─── Tool: complete_event ───────────────────────────────

  async completeEvent(path: string, completed: boolean, date?: string): Promise<string> {
    const fullPath = this.resolve(path);
    let content: string;
    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      return `Event file not found: ${path}`;
    }

    const parsed = matter(content);
    const type = (parsed.data.type as string) || "single";

    if (type === "single") {
      if (completed) {
        parsed.data.completed = true;
      } else {
        delete parsed.data.completed;
      }
    } else {
      const dates: string[] = (parsed.data.completedDates as string[]) || [];
      if (completed && date && !dates.includes(date)) {
        dates.push(date);
        parsed.data.completedDates = dates;
      } else if (!completed && date) {
        parsed.data.completedDates = dates.filter((d: string) => d !== date);
        if ((parsed.data.completedDates as string[]).length === 0) delete parsed.data.completedDates;
      }
    }

    const updated = matter.stringify(parsed.content, parsed.data);
    await writeFile(fullPath, updated, "utf8");
    return completed ? `Marked completed: ${path}` : `Marked incomplete: ${path}`;
  }

  // ─── Tool: delete_event ─────────────────────────────────

  async deleteEvent(path: string): Promise<string> {
    try {
      await unlink(this.resolve(path));
      return `Deleted event: ${path}`;
    } catch {
      return `Event file not found: ${path}`;
    }
  }
}
