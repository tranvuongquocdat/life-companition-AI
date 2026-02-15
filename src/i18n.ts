export type Language = "en" | "vi";

export interface I18n {
  // Chat UI
  greeting: string;
  thinking: string;
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
}

const en: I18n = {
  greeting: "Hi! I'm Life Companion. Send a message, or type `/dive` for deep dive mode.",
  thinking: "Thinking...",
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
};

const vi: I18n = {
  greeting: "Chào bạn! Mình là Life Companion. Hãy nhắn gì đó, hoặc gõ `/dive` để vào chế độ deep dive.",
  thinking: "Đang xử lý...",
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
};

const STRINGS: Record<Language, I18n> = { en, vi };

export function getI18n(lang: Language): I18n {
  return STRINGS[lang] || STRINGS.en;
}
