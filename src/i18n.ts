export type Language = "en" | "vi";

export interface I18n {
  // Chat UI
  greeting: string;
  thinking: string;
  deepThinking: string;
  usedTools: (n: number) => string;
  quickMode: string;
  deepDive: string;
  switchedToDive: string;
  switchedToQuick: string;
  newChat: string;
  chatHistory: string;
  noHistory: string;
  sendPlaceholder: string;
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  messages: string;
  noApiKey: (provider: string) => string;
  tokenExpired: string;
  error: (msg: string) => string;

  // Settings
  settingsTitle: string;
  apiProviders: string;
  defaultModels: string;
  enabledModels: string;
  enabledModelsDesc: string;
  quickCapture: string;
  quickCaptureDesc: string;
  deepDiveModel: string;
  deepDiveDesc: string;
  language: string;
  languageDesc: string;
  connectedVia: (method: string) => string;
  connected: string;
  disconnect: string;
  removeKey: string;
  verifySave: string;
  enterKeyFirst: string;
  keyVerified: (label: string) => string;
  invalidKey: string;
  noApiKeyBadge: string;
  mustHaveOneModel: string;
  claudeCodeLogin: string;
  connectedClaudeCode: string;
  orEnterApiKey: string;
  availableTools: string;
  availableToolsDesc: string;

  // Models
  refreshModels: string;
  modelsUpdated: (n: number) => string;
  noModelsFound: string;

  // Attachments
  maxAttachments: string;
  unsupportedFile: (ext: string) => string;
  attachFile: string;

  // Tabs
  maxTabs: string;

  // Calendar
  calendarTab: string;
  calendarNotInstalled: string;
  calendarToday: string;
  calendarNoEvents: string;
  calendarEventsFor: (date: string) => string;
  calendarAddEvent: string;
  calendarEditEvent: string;
  calendarDeleteConfirm: string;
  calendarEventTitle: string;
  calendarAllDay: string;
  calendarSave: string;
  calendarCancel: string;
  calendarEventCreated: string;
  calendarEventUpdated: string;
  calendarEventDeleted: string;
  calendarDate: string;
  calendarEndDate: string;
  calendarRepeat: string;
  calendarRepeatNone: string;
  calendarRepeatDaily: string;
  calendarRepeatWeekly: string;
  calendarRepeatMonthly: string;
  calendarRepeatCustom: string;
  calendarRepeatEvery: string;
  calendarRepeatDays: string;
  calendarRepeatWeeks: string;
  calendarRepeatMonths: string;
  calendarRepeatEnds: string;
  calendarRepeatNever: string;
  calendarRepeatUntil: string;
  calendarNotes: string;
  calendarNotesPlaceholder: string;
  calendarSaving: string;
  calendarSaveError: (msg: string) => string;
  calendarRecurring: string;
  tokenUsageTooltip: (input: string, output: string) => string;

  // Tool progress descriptions
  toolSearching: (query: string) => string;
  toolReading: (path: string) => string;
  toolWriting: (path: string) => string;
  toolMoving: (from: string, to: string) => string;
  toolListing: (path: string) => string;
  toolRecentNotes: (days: unknown) => string;
  toolWebSearch: (query: string) => string;
  toolFetching: (url: string) => string;
  toolAppending: (path: string) => string;
  toolReadingProps: (path: string) => string;
  toolUpdatingProps: (path: string) => string;
  toolGettingTags: string;
  toolSearchingTag: (tag: string) => string;
  toolVaultStats: string;
  toolBacklinks: (path: string) => string;
  toolOutgoing: (path: string) => string;
  toolGettingTasks: (path: string) => string;
  toolTogglingTask: string;
  toolDailyRead: (date?: string) => string;
  toolDailyCreate: (date?: string) => string;
  toolCalendarCheck: string;
  toolGettingEvents: (detail: string) => string;
  toolCreatingEvent: (title: string, date: string) => string;
  toolUpdatingEvent: string;
  toolDeletingEvent: string;
  toolUpcoming: (days: unknown) => string;
  toolSavingMemory: string;
  toolRecalling: (query?: string) => string;
  toolGatheringRetro: (start: string, end: string) => string;
  toolSavingRetro: (period: string) => string;
  toolGettingGoals: string;
  toolUpdatingGoal: (title: string) => string;
  toolUsing: (name: string) => string;
  toolDone: Record<string, string>;
}

const en: I18n = {
  greeting: "Hi! I'm Life Companion. Send a message, or type `/dive` for deep dive mode.",
  thinking: "Thinking",
  deepThinking: "Deep thinking",
  usedTools: (n) => `Used ${n} tool${n > 1 ? "s" : ""}`,
  quickMode: "Quick",
  deepDive: "Deep Dive",
  switchedToDive: "Switched to Deep Dive. I'll brainstorm, research and challenge ideas with you before writing notes.",
  switchedToQuick: "Switched to Quick Capture mode.",
  newChat: "New Chat",
  chatHistory: "Chat History",
  noHistory: "No saved conversations yet",
  sendPlaceholder: "Type a message...",
  justNow: "Just now",
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
  messages: "messages",
  noApiKey: (p) => `No API key for ${p}. Go to Settings → Life Companion to configure.`,
  tokenExpired: "Token expired. Please log in again in Settings.",
  error: (msg) => `Error: ${msg}`,

  settingsTitle: "Life Companion Settings",
  apiProviders: "API Providers",
  defaultModels: "Default Models",
  enabledModels: "Enabled Models",
  enabledModelsDesc: "Models shown in chat. Only connected providers can be enabled.",
  quickCapture: "Quick Capture",
  quickCaptureDesc: "Quick notes (prefer fast & cheap)",
  deepDiveModel: "Deep Dive",
  deepDiveDesc: "Brainstorm & deep thinking (prefer capable)",
  language: "Language",
  languageDesc: "Interface language",
  connectedVia: (m) => `Connected via ${m}`,
  connected: "Connected",
  disconnect: "Disconnect",
  removeKey: "Remove key",
  verifySave: "Verify & Save",
  enterKeyFirst: "Enter a key first",
  keyVerified: (l) => `${l} key verified!`,
  invalidKey: "Invalid key — check and try again",
  noApiKeyBadge: "No API key",
  mustHaveOneModel: "Must have at least 1 model enabled!",
  claudeCodeLogin: "Claude Code Login",
  connectedClaudeCode: "Connected to Claude Code!",
  orEnterApiKey: "Or enter API key from console.anthropic.com",
  availableTools: "Available Tools",
  availableToolsDesc: "Tools the AI can use during conversations. Disable tools you don't need.",
  refreshModels: "Refresh Models",
  modelsUpdated: (n) => `Found ${n} models`,
  noModelsFound: "Could not fetch models — check your API key",
  maxAttachments: "Maximum 4 attachments per message",
  unsupportedFile: (ext) => `Unsupported file type: .${ext}`,
  attachFile: "Attach file",
  maxTabs: "Maximum 8 tabs",
  calendarTab: "Calendar",
  calendarNotInstalled: "Full Calendar plugin is not installed. Install it from Community Plugins to use the calendar view.",
  calendarToday: "Today",
  calendarNoEvents: "No events",
  calendarEventsFor: (date) => `Events for ${date}`,
  calendarAddEvent: "Add Event",
  calendarEditEvent: "Edit Event",
  calendarDeleteConfirm: "Delete this event?",
  calendarEventTitle: "Title",
  calendarAllDay: "All day",
  calendarSave: "Save",
  calendarCancel: "Cancel",
  calendarEventCreated: "Event created!",
  calendarEventUpdated: "Event updated!",
  calendarEventDeleted: "Event deleted!",
  calendarDate: "Date",
  calendarEndDate: "End date",
  calendarRepeat: "Repeat",
  calendarRepeatNone: "Does not repeat",
  calendarRepeatDaily: "Every day",
  calendarRepeatWeekly: "Every week",
  calendarRepeatMonthly: "Every month",
  calendarRepeatCustom: "Custom...",
  calendarRepeatEvery: "Every",
  calendarRepeatDays: "days",
  calendarRepeatWeeks: "weeks",
  calendarRepeatMonths: "months",
  calendarRepeatEnds: "Ends",
  calendarRepeatNever: "Never",
  calendarRepeatUntil: "On date",
  calendarNotes: "Notes",
  calendarNotesPlaceholder: "Add notes...",
  calendarSaving: "Saving...",
  calendarSaveError: (msg) => `Failed to save: ${msg}`,
  calendarRecurring: "Recurring",
  tokenUsageTooltip: (input, output) => `Input: ${input} | Output: ${output}`,

  toolSearching: (q) => `Searching vault for "${q}"`,
  toolReading: (p) => `Reading ${p}`,
  toolWriting: (p) => `Writing to ${p}`,
  toolMoving: (f, t) => `Moving ${f} → ${t}`,
  toolListing: (p) => `Listing ${p}`,
  toolRecentNotes: (d) => `Getting notes from last ${d} days`,
  toolWebSearch: (q) => `Searching web for "${q}"`,
  toolFetching: (u) => `Fetching ${u}`,
  toolAppending: (p) => `Appending to ${p}`,
  toolReadingProps: (p) => `Reading properties of ${p}`,
  toolUpdatingProps: (p) => `Updating properties of ${p}`,
  toolGettingTags: "Getting vault tags",
  toolSearchingTag: (t) => `Searching for tag ${t}`,
  toolVaultStats: "Getting vault statistics",
  toolBacklinks: (p) => `Getting backlinks for ${p}`,
  toolOutgoing: (p) => `Getting outgoing links from ${p}`,
  toolGettingTasks: (p) => `Getting tasks from ${p}`,
  toolTogglingTask: "Toggling task",
  toolDailyRead: (d) => `Reading daily note${d ? " for " + d : ""}`,
  toolDailyCreate: (d) => `Creating daily note${d ? " for " + d : ""}`,
  toolCalendarCheck: "Checking calendar status",
  toolGettingEvents: (d) => `Getting events${d}`,
  toolCreatingEvent: (t, d) => `Creating event "${t}" on ${d}`,
  toolUpdatingEvent: "Updating event",
  toolDeletingEvent: "Deleting event",
  toolUpcoming: (d) => `Getting upcoming events (${d} days)`,
  toolSavingMemory: "Saving memory",
  toolRecalling: (q) => q ? `Recalling memories about "${q}"` : "Recalling recent memories",
  toolGatheringRetro: (s, e) => `Gathering retro data ${s} to ${e}`,
  toolSavingRetro: (p) => `Saving ${p} retrospective`,
  toolGettingGoals: "Reading goals",
  toolUpdatingGoal: (t) => `Updating goal: ${t}`,
  toolUsing: (n) => `Using ${n}`,
  toolDone: {
    search_vault: "Searched vault",
    read_note: "Read note",
    write_note: "Wrote note",
    move_note: "Moved note",
    list_folder: "Listed folder",
    get_recent_notes: "Got recent notes",
    web_search: "Web search done",
    web_fetch: "Fetched page",
    append_note: "Appended to note",
    read_properties: "Read properties",
    update_properties: "Updated properties",
    get_tags: "Got tags",
    search_by_tag: "Searched by tag",
    get_vault_stats: "Got vault stats",
    get_backlinks: "Got backlinks",
    get_outgoing_links: "Got outgoing links",
    get_tasks: "Got tasks",
    toggle_task: "Toggled task",
    get_daily_note: "Read daily note",
    create_daily_note: "Created daily note",
    check_calendar_status: "Checked calendar",
    get_events: "Got events",
    create_event: "Created event",
    update_event: "Updated event",
    delete_event: "Deleted event",
    get_upcoming_events: "Got upcoming events",
    save_memory: "Saved memory",
    recall_memory: "Recalled memories",
    gather_retro_data: "Gathered retro data",
    save_retro: "Saved retrospective",
    get_goals: "Read goals",
    update_goal: "Updated goal",
  },
};

const vi: I18n = {
  greeting: "Chào bạn! Mình là Life Companion. Hãy nhắn gì đó, hoặc gõ `/dive` để vào chế độ deep dive.",
  thinking: "Đang xử lý...",
  deepThinking: "Suy nghĩ sâu...",
  usedTools: (n) => `Đã dùng ${n} tool${n > 1 ? "s" : ""}`,
  quickMode: "Quick",
  deepDive: "Deep Dive",
  switchedToDive: "Đã chuyển sang Deep Dive. Mình sẽ brainstorm, research và challenge ý tưởng trước khi ghi note.",
  switchedToQuick: "Đã chuyển sang Quick Capture.",
  newChat: "New Chat",
  chatHistory: "Lịch sử chat",
  noHistory: "Chưa có cuộc trò chuyện nào được lưu",
  sendPlaceholder: "Nhắn gì đó...",
  justNow: "Vừa xong",
  minutesAgo: (n) => `${n} phút trước`,
  hoursAgo: (n) => `${n} giờ trước`,
  daysAgo: (n) => `${n} ngày trước`,
  messages: "tin nhắn",
  noApiKey: (p) => `Chưa có API key cho ${p}. Vào Settings → Life Companion để cấu hình.`,
  tokenExpired: "Token hết hạn. Vui lòng đăng nhập lại trong Settings.",
  error: (msg) => `Lỗi: ${msg}`,

  settingsTitle: "Life Companion Settings",
  apiProviders: "API Providers",
  defaultModels: "Default Models",
  enabledModels: "Enabled Models",
  enabledModelsDesc: "Models hiển thị trong chat. Chỉ providers đã kết nối mới được bật.",
  quickCapture: "Quick Capture",
  quickCaptureDesc: "Ghi chú nhanh (nên fast & cheap)",
  deepDiveModel: "Deep Dive",
  deepDiveDesc: "Brainstorm & suy nghĩ sâu (nên capable)",
  language: "Ngôn ngữ",
  languageDesc: "Ngôn ngữ giao diện",
  connectedVia: (m) => `Đã kết nối qua ${m}`,
  connected: "Đã kết nối",
  disconnect: "Ngắt kết nối",
  removeKey: "Xóa key",
  verifySave: "Xác minh & Lưu",
  enterKeyFirst: "Nhập key trước",
  keyVerified: (l) => `${l} key đã xác minh!`,
  invalidKey: "Key không hợp lệ — kiểm tra và thử lại",
  noApiKeyBadge: "Chưa có API key",
  mustHaveOneModel: "Phải có ít nhất 1 model được bật!",
  claudeCodeLogin: "Claude Code Login",
  connectedClaudeCode: "Đã kết nối Claude Code!",
  orEnterApiKey: "Hoặc nhập API key từ console.anthropic.com",
  availableTools: "Tools có sẵn",
  availableToolsDesc: "Các tools AI có thể dùng. Tắt tools không cần thiết.",
  refreshModels: "Làm mới danh sách model",
  modelsUpdated: (n) => `Tìm thấy ${n} model`,
  noModelsFound: "Không thể lấy danh sách model — kiểm tra API key",
  maxAttachments: "Tối đa 4 file đính kèm mỗi tin nhắn",
  unsupportedFile: (ext) => `Loại file không hỗ trợ: .${ext}`,
  attachFile: "Đính kèm file",
  maxTabs: "Tối đa 8 tab",
  calendarTab: "Lịch",
  calendarNotInstalled: "Plugin Full Calendar chưa được cài đặt. Cài từ Community Plugins để dùng chế độ xem lịch.",
  calendarToday: "Hôm nay",
  calendarNoEvents: "Không có sự kiện",
  calendarEventsFor: (date) => `Sự kiện ngày ${date}`,
  calendarAddEvent: "Thêm sự kiện",
  calendarEditEvent: "Sửa sự kiện",
  calendarDeleteConfirm: "Xóa sự kiện này?",
  calendarEventTitle: "Tiêu đề",
  calendarAllDay: "Cả ngày",
  calendarSave: "Lưu",
  calendarCancel: "Hủy",
  calendarEventCreated: "Đã tạo sự kiện!",
  calendarEventUpdated: "Đã cập nhật sự kiện!",
  calendarEventDeleted: "Đã xóa sự kiện!",
  calendarDate: "Ngày",
  calendarEndDate: "Ngày kết thúc",
  calendarRepeat: "Lặp lại",
  calendarRepeatNone: "Không lặp lại",
  calendarRepeatDaily: "Hàng ngày",
  calendarRepeatWeekly: "Hàng tuần",
  calendarRepeatMonthly: "Hàng tháng",
  calendarRepeatCustom: "Tùy chỉnh...",
  calendarRepeatEvery: "Mỗi",
  calendarRepeatDays: "ngày",
  calendarRepeatWeeks: "tuần",
  calendarRepeatMonths: "tháng",
  calendarRepeatEnds: "Kết thúc",
  calendarRepeatNever: "Không bao giờ",
  calendarRepeatUntil: "Đến ngày",
  calendarNotes: "Ghi chú",
  calendarNotesPlaceholder: "Thêm ghi chú...",
  calendarSaving: "Đang lưu...",
  calendarSaveError: (msg) => `Lỗi khi lưu: ${msg}`,
  calendarRecurring: "Lặp lại",
  tokenUsageTooltip: (input, output) => `Đầu vào: ${input} | Đầu ra: ${output}`,

  toolSearching: (q) => `Đang tìm "${q}"`,
  toolReading: (p) => `Đang đọc ${p}`,
  toolWriting: (p) => `Đang ghi ${p}`,
  toolMoving: (f, t) => `Đang di chuyển ${f} → ${t}`,
  toolListing: (p) => `Đang liệt kê ${p}`,
  toolRecentNotes: (d) => `Đang lấy notes ${d} ngày qua`,
  toolWebSearch: (q) => `Đang tìm trên web "${q}"`,
  toolFetching: (u) => `Đang tải ${u}`,
  toolAppending: (p) => `Đang thêm vào ${p}`,
  toolReadingProps: (p) => `Đang đọc thuộc tính ${p}`,
  toolUpdatingProps: (p) => `Đang cập nhật thuộc tính ${p}`,
  toolGettingTags: "Đang lấy danh sách tags",
  toolSearchingTag: (t) => `Đang tìm tag ${t}`,
  toolVaultStats: "Đang lấy thống kê vault",
  toolBacklinks: (p) => `Đang lấy backlinks của ${p}`,
  toolOutgoing: (p) => `Đang lấy outgoing links từ ${p}`,
  toolGettingTasks: (p) => `Đang lấy tasks từ ${p}`,
  toolTogglingTask: "Đang chuyển trạng thái task",
  toolDailyRead: (d) => `Đang đọc daily note${d ? " ngày " + d : ""}`,
  toolDailyCreate: (d) => `Đang tạo daily note${d ? " ngày " + d : ""}`,
  toolCalendarCheck: "Đang kiểm tra lịch",
  toolGettingEvents: (d) => `Đang lấy sự kiện${d}`,
  toolCreatingEvent: (t, d) => `Đang tạo sự kiện "${t}" ngày ${d}`,
  toolUpdatingEvent: "Đang cập nhật sự kiện",
  toolDeletingEvent: "Đang xóa sự kiện",
  toolUpcoming: (d) => `Đang lấy sự kiện sắp tới (${d} ngày)`,
  toolSavingMemory: "Đang lưu memory",
  toolRecalling: (q) => q ? `Đang tìm memory về "${q}"` : "Đang lấy memory gần đây",
  toolGatheringRetro: (s, e) => `Đang thu thập dữ liệu retro ${s} đến ${e}`,
  toolSavingRetro: (p) => `Đang lưu retro ${p}`,
  toolGettingGoals: "Đang đọc mục tiêu",
  toolUpdatingGoal: (t) => `Đang cập nhật mục tiêu: ${t}`,
  toolUsing: (n) => `Đang dùng ${n}`,
  toolDone: {
    search_vault: "Đã tìm xong",
    read_note: "Đã đọc note",
    write_note: "Đã ghi note",
    move_note: "Đã di chuyển note",
    list_folder: "Đã liệt kê",
    get_recent_notes: "Đã lấy notes gần đây",
    web_search: "Đã tìm trên web",
    web_fetch: "Đã tải trang",
    append_note: "Đã thêm vào note",
    read_properties: "Đã đọc thuộc tính",
    update_properties: "Đã cập nhật thuộc tính",
    get_tags: "Đã lấy tags",
    search_by_tag: "Đã tìm theo tag",
    get_vault_stats: "Đã lấy thống kê",
    get_backlinks: "Đã lấy backlinks",
    get_outgoing_links: "Đã lấy outgoing links",
    get_tasks: "Đã lấy tasks",
    toggle_task: "Đã chuyển task",
    get_daily_note: "Đã đọc daily note",
    create_daily_note: "Đã tạo daily note",
    check_calendar_status: "Đã kiểm tra lịch",
    get_events: "Đã lấy sự kiện",
    create_event: "Đã tạo sự kiện",
    update_event: "Đã cập nhật sự kiện",
    delete_event: "Đã xóa sự kiện",
    get_upcoming_events: "Đã lấy sự kiện sắp tới",
    save_memory: "Đã lưu memory",
    recall_memory: "Đã lấy memory",
    gather_retro_data: "Đã thu thập dữ liệu retro",
    save_retro: "Đã lưu retro",
    get_goals: "Đã đọc mục tiêu",
    update_goal: "Đã cập nhật mục tiêu",
  },
};

const STRINGS: Record<Language, I18n> = { en, vi };

export function getI18n(lang: Language): I18n {
  return STRINGS[lang] || STRINGS.en;
}
