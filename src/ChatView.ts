import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type LifeCompanionPlugin from "./main";
import {
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MODEL_CONTEXT_LIMITS,
  SUPPORTED_MIME_TYPES,
  getEffectiveModelGroups,
  resolveAttachmentType,
  type AIModel,
  type Attachment,
  type AttachmentRef,
  type ChatMessage,
  type ChatMode,
  type ConversationState,
  type SavedConversation,
} from "./types";
import { getI18n, type I18n } from "./i18n";

export const VIEW_TYPE_CHAT = "life-companion-chat";

export class ChatView extends ItemView {
  plugin: LifeCompanionPlugin;
  private messagesContainer: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private tokenCounterEl: HTMLElement;
  private modeToggle: HTMLButtonElement;
  private modelSelect: HTMLSelectElement;
  private historyBtn: HTMLButtonElement;
  private selectedModel: AIModel;
  private mode: ChatMode = "quick";
  private conversation: ConversationState;

  // Thinking state
  private thinkingEl: HTMLElement | null = null;
  private thinkingBody: HTMLElement | null = null;
  private thinkingToolMap = new Map<string, HTMLElement>();
  private thinkingStopped = false;

  // History panel
  private historyPanel: HTMLElement | null = null;

  // Tabs
  private tabScrollArea: HTMLElement;

  // Attachments
  private pendingAttachments: Attachment[] = [];
  private previewArea: HTMLElement;
  private fileInput: HTMLInputElement;

  // Calendar Tab
  private calendarContainer: HTMLElement;
  private bottomEl: HTMLElement;
  private calendarMonth: number = new Date().getMonth();
  private calendarYear: number = new Date().getFullYear();
  private calendarSelectedDate: string | null = null;
  private static readonly CALENDAR_TAB_ID = "__calendar__";

  private get t(): I18n {
    return getI18n(this.plugin.settings.language);
  }

  constructor(leaf: WorkspaceLeaf, plugin: LifeCompanionPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedModel = this.plugin.settings.quickModel;
    const now = Date.now();
    this.conversation = {
      id: now.toString(36),
      title: "New Chat", // will be overwritten by first user message
      messages: [],
      history: [],
      mode: "quick",
      model: this.selectedModel,
      createdAt: now,
      updatedAt: now,
    };
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    return this.conversation?.title || "Life Companion";
  }

  getIcon(): string {
    return "message-circle";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("life-companion-container");

    // ─── Tab Bar ───────────────────────────────────────────────
    const tabBar = container.createDiv({ cls: "lc-tab-bar" });
    this.tabScrollArea = tabBar.createDiv({ cls: "lc-tab-scroll" });

    const tabActions = tabBar.createDiv({ cls: "lc-tab-actions" });

    const newTabBtn = tabActions.createEl("button", {
      cls: "lc-icon-btn",
      attr: { "aria-label": "New Chat" },
    });
    setIcon(newTabBtn, "plus");
    newTabBtn.addEventListener("click", () => this.createNewTab());

    this.historyBtn = tabActions.createEl("button", {
      cls: "lc-icon-btn",
      attr: { "aria-label": "Chat History" },
    });
    setIcon(this.historyBtn, "clock");
    this.historyBtn.addEventListener("click", () => this.toggleHistory());

    // ─── Messages ───────────────────────────────────────────────
    this.messagesContainer = container.createDiv({ cls: "lc-messages" });

    // ─── Calendar View (hidden by default) ────────────────────
    this.calendarContainer = container.createDiv({ cls: "lc-calendar-view lc-hidden" });

    // ─── Bottom ─────────────────────────────────────────────────
    const bottom = container.createDiv({ cls: "lc-bottom" });
    this.bottomEl = bottom;

    // Resize handle (drag to resize input)
    const resizeHandle = bottom.createDiv({ cls: "lc-resize-handle" });
    this.setupResizeHandle(resizeHandle);

    // Preview area (above input)
    this.previewArea = bottom.createDiv({ cls: "lc-preview-area" });

    // Input wrapper (textarea + send button)
    const inputWrapper = bottom.createDiv({ cls: "lc-input-wrapper" });

    this.inputEl = inputWrapper.createEl("textarea", {
      cls: "lc-input",
      placeholder: this.t.sendPlaceholder,
      attr: { rows: "5" },
    });

    // Toolbar (below input): [model] [mode] [attach] [tokens]
    const toolbar = bottom.createDiv({ cls: "lc-toolbar" });

    this.modelSelect = toolbar.createEl("select", { cls: "lc-model-select" });
    this.populateModelSelect();
    this.modelSelect.addEventListener("change", () => {
      this.selectedModel = this.modelSelect.value as AIModel;
      this.conversation.model = this.selectedModel;
      this.updateTokenCounter();
    });

    this.modeToggle = toolbar.createEl("button", {
      cls: "lc-mode-toggle",
      text: this.t.quickMode,
    });
    this.modeToggle.addEventListener("click", () => this.toggleMode());

    const attachBtn = toolbar.createEl("button", {
      cls: "lc-attach-btn",
      attr: { "aria-label": this.t.attachFile },
    });
    setIcon(attachBtn, "paperclip");

    this.fileInput = bottom.createEl("input", {
      attr: {
        type: "file",
        accept: "image/*,application/pdf,.md,.txt",
        multiple: "true",
        style: "display:none",
      },
    }) as HTMLInputElement;

    attachBtn.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", () => {
      if (this.fileInput.files) {
        for (const file of Array.from(this.fileInput.files)) {
          this.addAttachmentFromFile(file);
        }
        this.fileInput.value = "";
      }
    });

    this.tokenCounterEl = toolbar.createDiv({ cls: "lc-token-counter" });
    this.updateTokenCounter();

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.inputEl.addEventListener("input", () => {
      this.autoResizeInput();
      this.updateSendBtnState();
    });

    // Paste handler for images
    this.inputEl.addEventListener("paste", (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) this.addAttachmentFromFile(blob);
          return;
        }
      }
    });

    // Send button (inside input wrapper)
    this.sendBtn = inputWrapper.createEl("button", {
      cls: "lc-send-btn",
      attr: { "aria-label": "Send" },
    });
    setIcon(this.sendBtn, "arrow-up");
    this.sendBtn.addEventListener("click", () => this.handleSend());

    // ─── Restore tabs ─────────────────────────────────────────
    this.initTabs();
  }

  async onClose() {
    if (this.conversation.messages.length > 0) {
      this.plugin.saveConversation(this.conversation);
    }
    this.plugin.saveData(this.plugin.settings);
    this.contentEl.empty();
  }

  // ─── Tabs ───────────────────────────────────────────────────

  private initTabs() {
    const s = this.plugin.settings;
    // Clean orphaned tabs (conversation was evicted from savedConversations)
    s.openTabs = s.openTabs.filter(
      (id) => s.savedConversations.some((c) => c.id === id)
    );

    if (s.openTabs.length === 0) {
      // First time: register current conversation as a tab
      this.plugin.saveConversation(this.conversation);
      s.openTabs = [this.conversation.id];
      s.activeTabId = this.conversation.id;
      this.plugin.saveData(s);
      this.addAssistantMessage(this.t.greeting);
    } else if (s.activeTabId === ChatView.CALENDAR_TAB_ID) {
      // Restore calendar view — load first chat in background
      const firstTab = s.openTabs[0];
      const saved = s.savedConversations.find((c) => c.id === firstTab);
      if (saved) this.loadConversation(saved);
      this.messagesContainer.addClass("lc-hidden");
      this.calendarContainer.removeClass("lc-hidden");
      this.bottomEl.addClass("lc-hidden");
      this.renderCalendar();
    } else {
      // Restore active tab
      const activeId = s.activeTabId && s.openTabs.includes(s.activeTabId)
        ? s.activeTabId
        : s.openTabs[0];
      const saved = s.savedConversations.find((c) => c.id === activeId);
      if (saved) {
        this.loadConversation(saved);
      } else {
        this.addAssistantMessage(this.t.greeting);
      }
    }
    this.renderTabs();
  }

  private renderTabs() {
    this.tabScrollArea.empty();
    const openTabs = this.plugin.settings.openTabs;
    const activeId = this.plugin.settings.activeTabId;

    // Calendar tab (always first, cannot be closed)
    const calTab = this.tabScrollArea.createDiv({
      cls: `lc-tab lc-tab-calendar ${activeId === ChatView.CALENDAR_TAB_ID ? "lc-tab-active" : ""}`,
    });
    const calIcon = calTab.createSpan({ cls: "lc-tab-icon" });
    setIcon(calIcon, "calendar");
    calTab.createSpan({ cls: "lc-tab-title", text: this.t.calendarTab });
    calTab.addEventListener("click", () => this.switchToCalendarTab());

    for (const tabId of openTabs) {
      const conv = this.plugin.settings.savedConversations.find((c) => c.id === tabId);
      const title = conv?.title || this.t.newChat;

      const tab = this.tabScrollArea.createDiv({
        cls: `lc-tab ${tabId === activeId ? "lc-tab-active" : ""}`,
      });
      const truncated = title.length > 18 ? title.slice(0, 18) + "..." : title;
      tab.createSpan({ cls: "lc-tab-title", text: truncated });

      if (openTabs.length > 1) {
        const closeBtn = tab.createSpan({ cls: "lc-tab-close" });
        closeBtn.textContent = "\u00D7";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(tabId);
        });
      }

      tab.addEventListener("click", () => this.switchToTab(tabId));
    }
  }

  private createNewTab() {
    const MAX_TABS = 8;
    if (this.plugin.settings.openTabs.length >= MAX_TABS) {
      new Notice(this.t.maxTabs);
      return;
    }

    // Save current conversation
    if (this.conversation.messages.length > 0) {
      this.plugin.saveConversation(this.conversation);
    }

    const now = Date.now();
    const newConv: ConversationState = {
      id: now.toString(36),
      title: this.t.newChat,
      messages: [],
      history: [],
      mode: "quick",
      model: this.plugin.settings.quickModel,
      createdAt: now,
      updatedAt: now,
    };

    this.plugin.saveConversation(newConv);
    this.plugin.settings.openTabs.push(newConv.id);
    this.plugin.settings.activeTabId = newConv.id;
    this.plugin.saveData(this.plugin.settings);

    this.loadConversationState(newConv);
    this.renderTabs();
  }

  private switchToTab(tabId: string) {
    if (tabId === this.conversation.id && this.plugin.settings.activeTabId !== ChatView.CALENDAR_TAB_ID) return;

    // Save current
    if (this.conversation.messages.length > 0) {
      this.plugin.saveConversation(this.conversation);
    }

    // Restore chat view if coming from calendar
    this.messagesContainer.removeClass("lc-hidden");
    this.calendarContainer.addClass("lc-hidden");
    this.bottomEl.removeClass("lc-hidden");

    const saved = this.plugin.settings.savedConversations.find((c) => c.id === tabId);
    if (saved) {
      this.loadConversation(saved);
    }

    this.plugin.settings.activeTabId = tabId;
    this.plugin.saveData(this.plugin.settings);
    this.renderTabs();
  }

  private switchToCalendarTab() {
    if (this.plugin.settings.activeTabId === ChatView.CALENDAR_TAB_ID) return;

    // Save current conversation
    if (this.conversation.messages.length > 0) {
      this.plugin.saveConversation(this.conversation);
    }

    this.plugin.settings.activeTabId = ChatView.CALENDAR_TAB_ID;
    this.plugin.saveData(this.plugin.settings);

    // Hide chat, show calendar
    this.messagesContainer.addClass("lc-hidden");
    this.calendarContainer.removeClass("lc-hidden");
    this.bottomEl.addClass("lc-hidden");

    this.renderCalendar();
    this.renderTabs();
  }

  // ─── Calendar Rendering ──────────────────────────────────────

  private async renderCalendar() {
    this.calendarContainer.empty();

    const cm = this.plugin.calendarManager;
    const installed = cm.isFullCalendarInstalled();

    if (!installed) {
      const notice = this.calendarContainer.createDiv({ cls: "lc-calendar-notice" });
      const iconEl = notice.createDiv({ cls: "lc-calendar-notice-icon" });
      setIcon(iconEl, "calendar-x");
      notice.createDiv({ cls: "lc-calendar-notice-text", text: this.t.calendarNotInstalled });
      return;
    }

    // Navigation bar
    const nav = this.calendarContainer.createDiv({ cls: "lc-cal-nav" });

    const prevBtn = nav.createEl("button", { cls: "lc-icon-btn" });
    setIcon(prevBtn, "chevron-left");
    prevBtn.addEventListener("click", () => {
      this.calendarMonth--;
      if (this.calendarMonth < 0) { this.calendarMonth = 11; this.calendarYear--; }
      this.renderCalendar();
    });

    const monthLabel = nav.createSpan({ cls: "lc-cal-month-label" });
    monthLabel.textContent = new Date(this.calendarYear, this.calendarMonth, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const nextBtn = nav.createEl("button", { cls: "lc-icon-btn" });
    setIcon(nextBtn, "chevron-right");
    nextBtn.addEventListener("click", () => {
      this.calendarMonth++;
      if (this.calendarMonth > 11) { this.calendarMonth = 0; this.calendarYear++; }
      this.renderCalendar();
    });

    const todayBtn = nav.createEl("button", { cls: "lc-cal-today-btn", text: this.t.calendarToday });
    todayBtn.addEventListener("click", () => {
      const now = new Date();
      this.calendarMonth = now.getMonth();
      this.calendarYear = now.getFullYear();
      this.calendarSelectedDate = now.toISOString().split("T")[0];
      this.renderCalendar();
    });

    // Day-of-week header
    const grid = this.calendarContainer.createDiv({ cls: "lc-cal-grid" });
    for (const dow of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      grid.createDiv({ cls: "lc-cal-dow", text: dow });
    }

    // Get events for this month
    let eventsMap = new Map<string, any[]>();
    try {
      eventsMap = await cm.getEventsForMonth(this.calendarYear, this.calendarMonth);
    } catch {
      // No events directory configured
    }

    // Calculate grid
    const firstDay = new Date(this.calendarYear, this.calendarMonth, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().split("T")[0];

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
      grid.createDiv({ cls: "lc-cal-cell lc-cal-empty" });
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = eventsMap.get(dateStr) || [];
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.calendarSelectedDate;

      const cell = grid.createDiv({
        cls: `lc-cal-cell${isToday ? " lc-cal-today" : ""}${isSelected ? " lc-cal-selected" : ""}${dayEvents.length > 0 ? " lc-cal-has-events" : ""}`,
      });

      cell.createDiv({ cls: "lc-cal-day-num", text: String(day) });

      if (dayEvents.length > 0) {
        const dots = cell.createDiv({ cls: "lc-cal-dots" });
        const showCount = Math.min(dayEvents.length, 3);
        for (let i = 0; i < showCount; i++) {
          dots.createSpan({ cls: "lc-cal-dot" });
        }
        if (dayEvents.length > 3) {
          dots.createSpan({ cls: "lc-cal-dot-more", text: `+${dayEvents.length - 3}` });
        }
      }

      cell.addEventListener("click", () => {
        this.calendarSelectedDate = dateStr;
        this.renderCalendar();
      });
    }

    // Selected day event list
    if (this.calendarSelectedDate) {
      const selectedEvents = eventsMap.get(this.calendarSelectedDate) || [];
      const dateLabel = new Date(this.calendarSelectedDate + "T00:00:00")
        .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

      const eventList = this.calendarContainer.createDiv({ cls: "lc-cal-event-list" });

      // Header with add button
      const headerRow = eventList.createDiv({ cls: "lc-cal-event-list-header" });
      headerRow.createSpan({ text: this.t.calendarEventsFor(dateLabel) });
      const addBtn = headerRow.createEl("button", { cls: "lc-cal-add-btn", attr: { "aria-label": this.t.calendarAddEvent } });
      setIcon(addBtn, "plus");
      addBtn.addEventListener("click", () => {
        this.renderEventForm(eventList, this.calendarSelectedDate!);
      });

      if (selectedEvents.length === 0) {
        eventList.createDiv({ cls: "lc-cal-no-events", text: this.t.calendarNoEvents });
      } else {
        for (const event of selectedEvents) {
          const item = eventList.createDiv({ cls: "lc-cal-event-item" });
          const time = event.allDay
            ? "All day"
            : `${event.startTime || ""}${event.endTime ? " - " + event.endTime : ""}`;

          if (time) item.createSpan({ cls: "lc-cal-event-time", text: time });
          item.createSpan({ cls: "lc-cal-event-title", text: event.title });

          if (event.completed) item.addClass("lc-cal-event-completed");

          // Action buttons (edit + delete)
          const actions = item.createDiv({ cls: "lc-cal-event-actions" });

          const editBtn = actions.createEl("button", { cls: "lc-cal-action-btn", attr: { "aria-label": this.t.calendarEditEvent } });
          setIcon(editBtn, "pencil");
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.renderEventForm(eventList, this.calendarSelectedDate!, event);
          });

          const deleteBtn = actions.createEl("button", { cls: "lc-cal-action-btn lc-cal-delete-btn", attr: { "aria-label": this.t.calendarDeleteConfirm } });
          setIcon(deleteBtn, "trash-2");
          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.deleteCalendarEvent(event.filePath);
          });

          item.addEventListener("click", () => {
            this.app.workspace.openLinkText(event.filePath, "", "tab");
          });
        }
      }
    }
  }

  private async deleteCalendarEvent(filePath: string) {
    if (!confirm(this.t.calendarDeleteConfirm)) return;
    const cm = this.plugin.calendarManager;
    await cm.deleteEvent(filePath);
    new Notice(this.t.calendarEventDeleted);
    this.renderCalendar();
  }

  private renderEventForm(
    container: HTMLElement,
    date: string,
    existing?: { filePath: string; title: string; startTime?: string; endTime?: string; allDay?: boolean },
  ) {
    // Remove any existing form
    container.querySelector(".lc-cal-event-form")?.remove();

    const isEdit = !!existing;
    const form = container.createDiv({ cls: "lc-cal-event-form" });

    // Title
    const titleRow = form.createDiv({ cls: "lc-cal-form-row" });
    titleRow.createEl("label", { text: this.t.calendarEventTitle });
    const titleInput = titleRow.createEl("input", {
      cls: "lc-cal-form-input",
      attr: { type: "text", placeholder: this.t.calendarEventTitle },
    });
    if (existing) titleInput.value = existing.title;

    // Date
    const dateRow = form.createDiv({ cls: "lc-cal-form-row" });
    dateRow.createEl("label", { text: "Date" });
    const dateInput = dateRow.createEl("input", {
      cls: "lc-cal-form-input",
      attr: { type: "date" },
    });
    dateInput.value = date;

    // All day toggle
    const allDayRow = form.createDiv({ cls: "lc-cal-form-row lc-cal-form-row-inline" });
    const allDayLabel = allDayRow.createEl("label", { text: this.t.calendarAllDay });
    const allDayCheck = allDayRow.createEl("input", { attr: { type: "checkbox" } });
    allDayCheck.checked = existing ? (existing.allDay !== false) : true;
    allDayLabel.prepend(allDayCheck);

    // Time row
    const timeRow = form.createDiv({ cls: "lc-cal-form-row lc-cal-form-time-row" });
    const startInput = timeRow.createEl("input", {
      cls: "lc-cal-form-input lc-cal-form-time",
      attr: { type: "time" },
    });
    timeRow.createSpan({ text: "—" });
    const endInput = timeRow.createEl("input", {
      cls: "lc-cal-form-input lc-cal-form-time",
      attr: { type: "time" },
    });
    if (existing?.startTime) startInput.value = existing.startTime;
    if (existing?.endTime) endInput.value = existing.endTime;

    const updateTimeVisibility = () => {
      timeRow.style.display = allDayCheck.checked ? "none" : "flex";
    };
    allDayCheck.addEventListener("change", updateTimeVisibility);
    updateTimeVisibility();

    // Buttons
    const btnRow = form.createDiv({ cls: "lc-cal-form-buttons" });
    const cancelBtn = btnRow.createEl("button", { cls: "lc-cal-form-cancel", text: this.t.calendarCancel });
    const saveBtn = btnRow.createEl("button", { cls: "lc-cal-form-save", text: this.t.calendarSave });

    cancelBtn.addEventListener("click", () => form.remove());

    saveBtn.addEventListener("click", async () => {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.addClass("lc-cal-form-error");
        titleInput.focus();
        return;
      }

      const cm = this.plugin.calendarManager;
      const eventDate = dateInput.value;
      const isAllDay = allDayCheck.checked;
      const startTime = isAllDay ? undefined : startInput.value || undefined;
      const endTime = isAllDay ? undefined : endInput.value || undefined;

      if (isEdit && existing) {
        // Update existing event
        const props: Record<string, unknown> = { title };
        if (eventDate !== date) props.date = eventDate;
        props.allDay = isAllDay;
        if (startTime) props.startTime = startTime;
        else props.startTime = null;
        if (endTime) props.endTime = endTime;
        else props.endTime = null;
        await cm.updateEvent(existing.filePath, props);
        new Notice(this.t.calendarEventUpdated);
      } else {
        // Create new event
        await cm.createEvent({
          title,
          date: eventDate,
          allDay: isAllDay,
          startTime,
          endTime,
        });
        new Notice(this.t.calendarEventCreated);
      }

      this.renderCalendar();
    });

    titleInput.focus();
  }

  private closeTab(tabId: string) {
    const tabs = this.plugin.settings.openTabs;
    const idx = tabs.indexOf(tabId);
    if (idx < 0) return;

    tabs.splice(idx, 1);

    if (this.plugin.settings.activeTabId === tabId) {
      const newIdx = Math.min(idx, tabs.length - 1);
      const newActiveId = tabs[newIdx];
      this.plugin.settings.activeTabId = newActiveId;

      const saved = this.plugin.settings.savedConversations.find((c) => c.id === newActiveId);
      if (saved) {
        this.loadConversation(saved);
      }
    }

    this.plugin.saveData(this.plugin.settings);
    this.renderTabs();
  }

  // ─── Model Select ─────────────────────────────────────────────

  refreshModels() {
    this.populateModelSelect();
    this.updateTokenCounter();
  }

  private populateModelSelect() {
    this.modelSelect.empty();
    const enabledModels = this.plugin.settings.enabledModels;
    for (const group of getEffectiveModelGroups(this.plugin.settings.customModels)) {
      const enabledInGroup = group.models.filter((m) => enabledModels.includes(m.id));
      if (enabledInGroup.length === 0) continue;
      const optgroup = this.modelSelect.createEl("optgroup", { attr: { label: group.label } });
      for (const model of enabledInGroup) {
        optgroup.createEl("option", { value: model.id, text: model.name });
      }
    }
    if (!enabledModels.includes(this.selectedModel)) {
      this.selectedModel = enabledModels[0];
      this.conversation.model = this.selectedModel;
    }
    this.modelSelect.value = this.selectedModel;
  }

  // ─── Mode Toggle ──────────────────────────────────────────────

  private toggleMode() {
    this.mode = this.mode === "quick" ? "dive" : "quick";
    this.conversation.mode = this.mode;
    this.modeToggle.textContent = this.mode === "quick" ? this.t.quickMode : this.t.deepDive;
    this.modeToggle.toggleClass("lc-mode-dive", this.mode === "dive");
    this.selectedModel =
      this.mode === "quick"
        ? this.plugin.settings.quickModel
        : this.plugin.settings.diveModel;
    this.conversation.model = this.selectedModel;
    this.modelSelect.value = this.selectedModel;
  }

  // ─── Resize Handle ──────────────────────────────────────────

  private setupResizeHandle(handle: HTMLElement) {
    let startY = 0;
    let startH = 0;

    const onMouseMove = (e: MouseEvent) => {
      // Dragging up = smaller Y = increase height
      const delta = startY - e.clientY;
      const newH = Math.max(28, Math.min(startH + delta, this.contentEl.clientHeight * 0.6));
      this.inputEl.style.height = newH + "px";
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.removeClass("lc-resizing");
    };

    handle.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      startY = e.clientY;
      startH = this.inputEl.offsetHeight;
      document.body.addClass("lc-resizing");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  // ─── Auto-resize Textarea ─────────────────────────────────────

  private autoResizeInput() {
    this.inputEl.style.height = "auto";
    const maxH = this.contentEl.clientHeight * 0.6;
    this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, maxH) + "px";
  }

  private updateSendBtnState() {
    const hasContent = this.inputEl.value.trim().length > 0 || this.pendingAttachments.length > 0;
    this.sendBtn.toggleClass("lc-send-active", hasContent);
  }

  // ─── Thinking Container (Claude-style) ─────────────────────────

  private static getToolDescription(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "search_vault":
        return `Searching vault for "${input.query}"`;
      case "read_note":
        return `Reading ${input.path}`;
      case "write_note":
        return `Writing to ${input.path}`;
      case "move_note":
        return `Moving ${input.from} → ${input.to}`;
      case "list_folder":
        return `Listing ${input.path || "/"}`;
      case "get_recent_notes":
        return `Getting notes from last ${input.days} days`;
      case "web_search":
        return `Searching web for "${input.query}"`;
      case "web_fetch": {
        const url = String(input.url || "");
        const short = url.length > 40 ? url.slice(0, 40) + "..." : url;
        return `Fetching ${short}`;
      }
      case "append_note":
        return `Appending to ${input.path}`;
      case "read_properties":
        return `Reading properties of ${input.path}`;
      case "update_properties":
        return `Updating properties of ${input.path}`;
      case "get_tags":
        return "Getting vault tags";
      case "search_by_tag":
        return `Searching for tag ${input.tag}`;
      case "get_vault_stats":
        return "Getting vault statistics";
      case "get_backlinks":
        return `Getting backlinks for ${input.path}`;
      case "get_outgoing_links":
        return `Getting outgoing links from ${input.path}`;
      case "get_tasks":
        return `Getting tasks from ${input.path || "vault"}`;
      case "toggle_task":
        return `Toggling task at ${input.path}:${input.line}`;
      case "get_daily_note":
        return `Reading daily note${input.date ? " for " + input.date : ""}`;
      case "create_daily_note":
        return `Creating daily note${input.date ? " for " + input.date : ""}`;
      case "check_calendar_status":
        return "Checking calendar status";
      case "get_events":
        return `Getting events${input.date ? " for " + input.date : ""}${input.startDate ? " from " + input.startDate + " to " + input.endDate : ""}`;
      case "create_event":
        return `Creating event "${input.title}" on ${input.date}`;
      case "update_event":
        return `Updating event ${input.path}`;
      case "delete_event":
        return `Deleting event ${input.path}`;
      case "get_upcoming_events":
        return `Getting upcoming events (${input.days || 7} days)`;
      default:
        return `Using ${name}`;
    }
  }

  private static readonly TOOL_DONE_NAMES: Record<string, string> = {
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
  };

  startThinking() {
    this.thinkingStopped = false;
    this.thinkingToolMap.clear();

    this.thinkingEl = this.messagesContainer.createDiv({ cls: "lc-thinking" });

    const header = this.thinkingEl.createDiv({ cls: "lc-thinking-header" });
    header.createSpan({ cls: "lc-thinking-dot" });
    header.createSpan({ cls: "lc-thinking-label", text: this.t.thinking });

    this.thinkingBody = this.thinkingEl.createDiv({ cls: "lc-thinking-body" });

    header.addEventListener("click", () => {
      if (!this.thinkingBody) return;
      const collapsed = this.thinkingBody.hasClass("lc-collapsed");
      this.thinkingBody.toggleClass("lc-collapsed", !collapsed);
    });

    this.scrollToBottom();
  }

  addToolCall(name: string, input: Record<string, unknown>) {
    if (!this.thinkingBody) return;

    const desc = ChatView.getToolDescription(name, input);
    const item = this.thinkingBody.createDiv({ cls: "lc-thinking-tool" });
    item.createSpan({ cls: "lc-tool-spinner" });
    item.createSpan({ cls: "lc-thinking-tool-text", text: desc });

    // Update header label to show current tool activity
    const label = this.thinkingEl?.querySelector(".lc-thinking-label");
    if (label) label.textContent = desc;

    this.thinkingToolMap.set(name, item);
    this.scrollToBottom();
  }

  completeToolCall(name: string, result: string) {
    const item = this.thinkingToolMap.get(name);
    if (!item) return;

    item.addClass("lc-thinking-tool-done");

    const spinner = item.querySelector(".lc-tool-spinner");
    if (spinner) {
      const check = document.createElement("span");
      check.className = "lc-tool-check";
      check.textContent = "\u2713";
      spinner.replaceWith(check);
    }

    // Keep original description, just append result preview
    if (result) {
      const preview = result.length > 80 ? result.slice(0, 80) + "..." : result;
      item.createSpan({ cls: "lc-thinking-tool-preview", text: ` — ${preview}` });
    }

    // Update header label to show completed action
    const label = this.thinkingEl?.querySelector(".lc-thinking-label");
    const doneName = ChatView.TOOL_DONE_NAMES[name] || name;
    if (label) label.textContent = doneName;
  }

  stopThinking() {
    if (this.thinkingStopped || !this.thinkingEl) return;
    this.thinkingStopped = true;

    const dot = this.thinkingEl.querySelector(".lc-thinking-dot");
    if (dot) dot.remove();

    const label = this.thinkingEl.querySelector(".lc-thinking-label");
    const toolCount = this.thinkingToolMap.size;

    if (toolCount === 0) {
      // No tools were used — remove thinking container entirely
      this.thinkingEl.remove();
      this.thinkingEl = null;
      return;
    }

    this.thinkingEl.addClass("lc-thinking-done");

    if (label) {
      label.textContent = this.t.usedTools(toolCount);
    }

    // Add expand arrow — body stays open so user can see what was done
    const arrow = document.createElement("span");
    arrow.className = "lc-thinking-arrow";
    arrow.textContent = "\u25BE"; // down arrow = expanded
    this.thinkingEl.querySelector(".lc-thinking-header")?.prepend(arrow);
  }

  // ─── History Panel ─────────────────────────────────────────────

  private toggleHistory() {
    if (this.historyPanel) {
      this.historyPanel.remove();
      this.historyPanel = null;
      return;
    }

    this.historyPanel = this.contentEl.createDiv({ cls: "lc-history-panel" });

    // Header
    const header = this.historyPanel.createDiv({ cls: "lc-history-header" });
    const backBtn = header.createEl("button", { cls: "lc-icon-btn" });
    setIcon(backBtn, "arrow-left");
    backBtn.addEventListener("click", () => {
      this.historyPanel?.remove();
      this.historyPanel = null;
    });
    header.createSpan({ cls: "lc-history-title", text: this.t.chatHistory });

    // List
    const list = this.historyPanel.createDiv({ cls: "lc-history-list" });
    const saved = this.plugin.settings.savedConversations || [];

    if (saved.length === 0) {
      list.createDiv({
        cls: "lc-history-empty",
        text: this.t.noHistory,
      });
    } else {
      for (const conv of [...saved].reverse()) {
        const item = list.createDiv({ cls: "lc-history-item" });
        item.createDiv({ cls: "lc-history-item-title", text: conv.title });
        item.createDiv({
          cls: "lc-history-item-meta",
          text: `${this.timeAgo(conv.updatedAt)} · ${conv.messages.length} ${this.t.messages}`,
        });

        item.addEventListener("click", () => {
          // Save current conversation before switching
          if (this.conversation.messages.length > 0) {
            this.plugin.saveConversation(this.conversation);
          }
          // Add to open tabs if not already there
          if (!this.plugin.settings.openTabs.includes(conv.id)) {
            if (this.plugin.settings.openTabs.length >= 8) {
              new Notice(this.t.maxTabs);
              this.historyPanel?.remove();
              this.historyPanel = null;
              return;
            }
            this.plugin.settings.openTabs.push(conv.id);
          }
          this.plugin.settings.activeTabId = conv.id;
          this.plugin.saveData(this.plugin.settings);
          this.loadConversation(conv);
          this.renderTabs();
          this.historyPanel?.remove();
          this.historyPanel = null;
        });
      }
    }
  }

  private timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return this.t.justNow;
    if (mins < 60) return this.t.minutesAgo(mins);
    const hours = Math.floor(mins / 60);
    if (hours < 24) return this.t.hoursAgo(hours);
    const days = Math.floor(hours / 24);
    if (days < 7) return this.t.daysAgo(days);
    return new Date(timestamp).toLocaleDateString();
  }

  private loadConversation(saved: SavedConversation) {
    const conv: ConversationState = {
      id: saved.id,
      title: saved.title,
      messages: [...saved.messages],
      history: saved.messages.map((m) => ({ role: m.role, content: m.content })),
      mode: saved.mode,
      model: saved.model,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
    this.loadConversationState(conv);
  }

  /** Load a ConversationState into the UI (shared by tabs and history) */
  private loadConversationState(conv: ConversationState) {
    this.conversation = conv;
    this.mode = conv.mode;
    this.selectedModel = conv.model;
    this.modeToggle.textContent = this.mode === "quick" ? this.t.quickMode : this.t.deepDive;
    this.modeToggle.toggleClass("lc-mode-dive", this.mode === "dive");
    this.populateModelSelect();
    this.messagesContainer.empty();

    if (conv.messages.length === 0) {
      this.addAssistantMessage(this.t.greeting);
    } else {
      for (const msg of conv.messages) {
        if (msg.role === "user") {
          const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-user" });
          if (msg.attachmentRefs && msg.attachmentRefs.length > 0) {
            this.renderAttachmentBadges(el, msg.attachmentRefs);
          }
          el.createDiv({ cls: "lc-msg-text", text: msg.content });
        } else {
          const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant" });
          this.renderMarkdown(el, msg.content);
        }
      }
    }

    this.updateTokenCounter();
    this.scrollToBottom();
    (this.leaf as any).updateHeader(); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  // ─── New Chat ─────────────────────────────────────────────────

  private startNewChat() {
    this.createNewTab();
  }

  // ─── Send Message ─────────────────────────────────────────────

  private async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (text === "/dive") {
      this.mode = "dive";
      this.conversation.mode = this.mode;
      this.modeToggle.textContent = this.t.deepDive;
      this.modeToggle.addClass("lc-mode-dive");
      this.selectedModel = this.plugin.settings.diveModel;
      this.conversation.model = this.selectedModel;
      this.modelSelect.value = this.selectedModel;
      this.addAssistantMessage(this.t.switchedToDive);
      this.inputEl.value = "";
      this.autoResizeInput();
      return;
    }

    if (text === "/quick") {
      this.mode = "quick";
      this.conversation.mode = this.mode;
      this.modeToggle.textContent = this.t.quickMode;
      this.modeToggle.removeClass("lc-mode-dive");
      this.selectedModel = this.plugin.settings.quickModel;
      this.conversation.model = this.selectedModel;
      this.modelSelect.value = this.selectedModel;
      this.addAssistantMessage(this.t.switchedToQuick);
      this.inputEl.value = "";
      this.autoResizeInput();
      return;
    }

    // Capture attachments before clearing
    const attachments = this.pendingAttachments.length > 0 ? [...this.pendingAttachments] : undefined;
    const attachmentRefs: AttachmentRef[] | undefined = attachments
      ? attachments.map((a) => ({ name: a.name, type: a.type, mimeType: a.mimeType }))
      : undefined;
    this.pendingAttachments = [];
    this.renderPreview();

    this.inputEl.value = "";
    this.autoResizeInput();
    this.addUserMessage(text, attachmentRefs);

    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    try {
      await this.plugin.handleMessage(text, this.conversation, this, attachments);
      this.conversation.updatedAt = Date.now();
      // Auto-save after each exchange
      this.plugin.saveConversation(this.conversation);
    } finally {
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
      this.updateTokenCounter();
    }
  }

  // ─── Messages ─────────────────────────────────────────────────

  addUserMessage(text: string, attachmentRefs?: AttachmentRef[]) {
    if (this.conversation.messages.filter((m) => m.role === "user").length === 0) {
      this.conversation.title = text.length > 50 ? text.slice(0, 50) + "..." : text;
      (this.leaf as any).updateHeader(); // eslint-disable-line @typescript-eslint/no-explicit-any
      this.renderTabs();
    }

    const msg: ChatMessage = { role: "user", content: text, timestamp: Date.now(), attachmentRefs };
    this.conversation.messages.push(msg);
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-user" });
    if (attachmentRefs && attachmentRefs.length > 0) {
      this.renderAttachmentBadges(el, attachmentRefs);
    }
    el.createDiv({ cls: "lc-msg-text", text });
    this.scrollToBottom();
    this.updateTokenCounter();
  }

  addAssistantMessage(text: string) {
    const msg: ChatMessage = { role: "assistant", content: text, timestamp: Date.now() };
    this.conversation.messages.push(msg);
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant" });
    this.renderMarkdown(el, text);
    this.scrollToBottom();
    this.updateTokenCounter();
  }

  createStreamingMessage(): HTMLElement {
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant" });
    this.scrollToBottom();
    return el;
  }

  async renderMarkdown(el: HTMLElement, text: string) {
    el.empty();
    await MarkdownRenderer.render(this.app, text, el, "", this);
    // Make [[wiki links]] clickable — open or reveal the referenced note
    el.querySelectorAll("a.internal-link").forEach((linkEl) => {
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        const href = linkEl.getAttribute("href");
        if (!href) return;
        // Check if note is already open in a tab
        const existing = this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
          const file = (leaf.view as any)?.file;
          return file && (file.path === href || file.path === href + ".md" || file.basename === href);
        });
        if (existing) {
          this.app.workspace.setActiveLeaf(existing, { focus: true });
        } else {
          this.app.workspace.openLinkText(href, "", "tab");
        }
      });
    });
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  // ─── Attachments ─────────────────────────────────────────────

  private async addAttachmentFromFile(file: File) {
    if (this.pendingAttachments.length >= MAX_ATTACHMENTS) {
      new Notice(this.t.maxAttachments);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeType = file.type || SUPPORTED_MIME_TYPES[ext];
    if (!mimeType || !Object.values(SUPPORTED_MIME_TYPES).includes(mimeType)) {
      new Notice(this.t.unsupportedFile(ext));
      return;
    }

    const type = resolveAttachmentType(mimeType);

    if (type === "text") {
      const text = await file.text();
      this.pendingAttachments.push({ name: file.name, mimeType, type, data: text, size: file.size });
    } else if (type === "image" && file.size > MAX_IMAGE_BYTES) {
      const resized = await this.resizeImage(file);
      this.pendingAttachments.push({ name: file.name, mimeType: "image/jpeg", type, data: resized, size: file.size });
    } else {
      const data = await this.blobToBase64(file);
      this.pendingAttachments.push({ name: file.name, mimeType, type, data, size: file.size });
    }

    this.renderPreview();
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private resizeImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  private renderPreview() {
    this.previewArea.empty();
    if (this.pendingAttachments.length === 0) {
      this.previewArea.addClass("lc-hidden");
      return;
    }
    this.previewArea.removeClass("lc-hidden");

    for (let i = 0; i < this.pendingAttachments.length; i++) {
      const att = this.pendingAttachments[i];
      const item = this.previewArea.createDiv({ cls: "lc-preview-item" });

      if (att.type === "image") {
        const thumb = item.createEl("img", { cls: "lc-preview-thumb" });
        thumb.src = `data:${att.mimeType};base64,${att.data}`;
      } else {
        const icon = item.createDiv({ cls: "lc-preview-file-icon" });
        setIcon(icon, att.type === "pdf" ? "file-text" : "file");
        item.createSpan({ cls: "lc-preview-name", text: att.name });
      }

      const removeBtn = item.createEl("button", { cls: "lc-preview-remove" });
      removeBtn.textContent = "\u00D7";
      const idx = i;
      removeBtn.addEventListener("click", () => {
        this.pendingAttachments.splice(idx, 1);
        this.renderPreview();
      });
    }
    this.updateSendBtnState();
  }

  private renderAttachmentBadges(parentEl: HTMLElement, refs: AttachmentRef[]) {
    const badges = parentEl.createDiv({ cls: "lc-attachment-badges" });
    for (const ref of refs) {
      const badge = badges.createDiv({ cls: "lc-attachment-badge" });
      const iconName = ref.type === "image" ? "image" : ref.type === "pdf" ? "file-text" : "file";
      const iconEl = badge.createSpan({ cls: "lc-badge-icon" });
      setIcon(iconEl, iconName);
      badge.createSpan({ text: ref.name });
    }
  }

  // ─── Token Counter ────────────────────────────────────────────

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  private getConversationTokens(): number {
    let total = 500;
    for (const msg of this.conversation.history) {
      total += this.estimateTokens(msg.content);
    }
    return total;
  }

  private formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  }

  private updateTokenCounter() {
    if (!this.tokenCounterEl) return;
    const used = this.getConversationTokens();
    const limit = MODEL_CONTEXT_LIMITS[this.selectedModel] || 200000;
    const ratio = used / limit;

    this.tokenCounterEl.textContent = `~${this.formatTokenCount(used)} / ${this.formatTokenCount(limit)}`;
    this.tokenCounterEl.toggleClass("lc-token-warning", ratio > 0.7);
  }
}
