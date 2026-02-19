import type { ServerVaultTools } from "./vault-tools";
import type { ServerCalendarManager } from "./calendar-manager";

export function createToolExecutor(
  vaultTools: ServerVaultTools,
  calendarManager: ServerCalendarManager,
): (name: string, input: Record<string, unknown>) => Promise<string> {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    try {
      switch (name) {
        case "search_vault":
          return await vaultTools.searchVault(String(input.query ?? ""));
        case "read_note":
          return await vaultTools.readNote(String(input.path ?? ""));
        case "write_note":
          return await vaultTools.writeNote(String(input.path ?? ""), String(input.content ?? ""));
        case "move_note":
          return await vaultTools.moveNote(String(input.from ?? ""), String(input.to ?? ""));
        case "list_folder":
          return await vaultTools.listFolder(String(input.path ?? ""));
        case "get_recent_notes":
          return await vaultTools.getRecentNotes(Number(input.days ?? 0));
        case "get_snapshots":
          return await vaultTools.getSnapshots(String(input.path ?? ""));
        case "read_snapshot":
          return await vaultTools.readSnapshot(String(input.path ?? ""));
        case "web_search":
          return await vaultTools.webSearch(String(input.query ?? ""));
        case "web_fetch":
          return await vaultTools.webFetch(String(input.url ?? ""));
        case "append_note":
          return await vaultTools.appendNote(String(input.path ?? ""), String(input.content ?? ""));
        case "read_properties":
          return await vaultTools.readProperties(String(input.path ?? ""));
        case "update_properties":
          return await vaultTools.updateProperties(String(input.path ?? ""), (input.properties ?? {}) as Record<string, unknown>);
        case "get_tags":
          return await vaultTools.getTags();
        case "search_by_tag":
          return await vaultTools.searchByTag(String(input.tag ?? ""));
        case "get_vault_stats":
          return await vaultTools.getVaultStats();
        case "get_backlinks":
          return await vaultTools.getBacklinks(String(input.path ?? ""));
        case "get_outgoing_links":
          return await vaultTools.getOutgoingLinks(String(input.path ?? ""));
        case "get_tasks":
          return await vaultTools.getTasks(String(input.path ?? ""), input.includeCompleted !== false);
        case "toggle_task":
          return await vaultTools.toggleTask(String(input.path ?? ""), Number(input.line ?? 0));
        case "get_daily_note":
          return await vaultTools.getDailyNote(String(input.date ?? ""));
        case "create_daily_note":
          return await vaultTools.createDailyNote(String(input.date ?? ""), String(input.content ?? ""));
        // Calendar tools
        case "check_calendar_status":
          return await calendarManager.checkCalendarStatus();
        case "get_events":
          return await calendarManager.getEvents(String(input.date ?? ""), String(input.startDate ?? ""), String(input.endDate ?? ""));
        case "create_event":
          return await calendarManager.createEvent({
            title: String(input.title ?? ""), date: String(input.date ?? ""),
            startTime: String(input.startTime ?? ""), endTime: String(input.endTime ?? ""),
            allDay: input.allDay === true, endDate: String(input.endDate ?? ""),
            type: (String(input.type ?? "single")) as "single" | "recurring" | "rrule",
            daysOfWeek: Array.isArray(input.daysOfWeek) ? input.daysOfWeek.map(String) : [],
            startRecur: String(input.startRecur ?? ""),
            endRecur: String(input.endRecur ?? ""), rrule: String(input.rrule ?? ""),
            body: String(input.body ?? ""),
          });
        case "update_event":
          return await calendarManager.updateEvent(String(input.path ?? ""), (input.properties ?? {}) as Record<string, unknown>);
        case "delete_event":
          return await calendarManager.deleteEvent(String(input.path ?? ""));
        case "complete_event":
          return await calendarManager.completeEvent(String(input.path ?? ""), input.completed === true, input.date ? String(input.date) : undefined);
        case "get_upcoming_events":
          return await calendarManager.getUpcomingEvents(Number(input.days ?? 0) || 7);
        // Memory & Goals tools
        case "save_memory":
          return await vaultTools.saveMemory(String(input.content ?? ""), String(input.type ?? ""));
        case "recall_memory":
          return await vaultTools.recallMemory(String(input.query ?? ""), Number(input.days ?? 0), Number(input.limit ?? 0));
        case "gather_retro_data":
          return await vaultTools.gatherRetroData(String(input.startDate ?? ""), String(input.endDate ?? ""));
        case "save_retro":
          return await vaultTools.saveRetro(String(input.period ?? ""), String(input.content ?? ""));
        case "get_goals":
          return await vaultTools.getGoals();
        case "update_goal":
          return await vaultTools.updateGoal(String(input.title ?? ""), {
            status: String(input.status ?? ""),
            progress: String(input.progress ?? ""),
            target: String(input.target ?? ""),
          });
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Error executing ${name}: ${(error as Error).message}`;
    }
  };
}
