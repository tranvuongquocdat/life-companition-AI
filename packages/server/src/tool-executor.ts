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
          return await vaultTools.searchVault(input.query as string);
        case "read_note":
          return await vaultTools.readNote(input.path as string);
        case "write_note":
          return await vaultTools.writeNote(input.path as string, input.content as string);
        case "move_note":
          return await vaultTools.moveNote(input.from as string, input.to as string);
        case "list_folder":
          return await vaultTools.listFolder(input.path as string);
        case "get_recent_notes":
          return await vaultTools.getRecentNotes(input.days as number);
        case "get_snapshots":
          return await vaultTools.getSnapshots(input.path as string);
        case "read_snapshot":
          return await vaultTools.readSnapshot(input.path as string);
        case "web_search":
          return await vaultTools.webSearch(input.query as string);
        case "web_fetch":
          return await vaultTools.webFetch(input.url as string);
        case "append_note":
          return await vaultTools.appendNote(input.path as string, input.content as string);
        case "read_properties":
          return await vaultTools.readProperties(input.path as string);
        case "update_properties":
          return await vaultTools.updateProperties(input.path as string, input.properties as Record<string, unknown>);
        case "get_tags":
          return await vaultTools.getTags();
        case "search_by_tag":
          return await vaultTools.searchByTag(input.tag as string);
        case "get_vault_stats":
          return await vaultTools.getVaultStats();
        case "get_backlinks":
          return await vaultTools.getBacklinks(input.path as string);
        case "get_outgoing_links":
          return await vaultTools.getOutgoingLinks(input.path as string);
        case "get_tasks":
          return await vaultTools.getTasks(input.path as string, (input.includeCompleted as boolean) ?? true);
        case "toggle_task":
          return await vaultTools.toggleTask(input.path as string, input.line as number);
        case "get_daily_note":
          return await vaultTools.getDailyNote(input.date as string);
        case "create_daily_note":
          return await vaultTools.createDailyNote(input.date as string, input.content as string);
        // Calendar tools
        case "check_calendar_status":
          return await calendarManager.checkCalendarStatus();
        case "get_events":
          return await calendarManager.getEvents(input.date as string, input.startDate as string, input.endDate as string);
        case "create_event":
          return await calendarManager.createEvent({
            title: input.title as string, date: input.date as string,
            startTime: input.startTime as string, endTime: input.endTime as string,
            allDay: input.allDay as boolean, endDate: input.endDate as string,
            type: input.type as "single" | "recurring" | "rrule",
            daysOfWeek: input.daysOfWeek as string[], startRecur: input.startRecur as string,
            endRecur: input.endRecur as string, rrule: input.rrule as string,
            body: input.body as string,
          });
        case "update_event":
          return await calendarManager.updateEvent(input.path as string, input.properties as Record<string, unknown>);
        case "delete_event":
          return await calendarManager.deleteEvent(input.path as string);
        case "complete_event":
          return await calendarManager.completeEvent(input.path as string, input.completed as boolean, input.date as string | undefined);
        case "get_upcoming_events":
          return await calendarManager.getUpcomingEvents((input.days as number) || 7);
        // Memory & Goals tools
        case "save_memory":
          return await vaultTools.saveMemory(input.content as string, input.type as string);
        case "recall_memory":
          return await vaultTools.recallMemory(input.query as string, input.days as number, input.limit as number);
        case "gather_retro_data":
          return await vaultTools.gatherRetroData(input.startDate as string, input.endDate as string);
        case "save_retro":
          return await vaultTools.saveRetro(input.period as string, input.content as string);
        case "get_goals":
          return await vaultTools.getGoals();
        case "update_goal":
          return await vaultTools.updateGoal(input.title as string, {
            status: input.status as string,
            progress: input.progress as string,
            target: input.target as string,
          });
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Error executing ${name}: ${(error as Error).message}`;
    }
  };
}
