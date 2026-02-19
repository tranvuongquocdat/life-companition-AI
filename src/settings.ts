import { App, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type LifeCompanionPlugin from "./main";
import {
  ALL_TOOLS, MODEL_GROUPS, getEffectiveModelGroups,
  VAULT_TOOLS, KNOWLEDGE_TOOLS, GRAPH_TOOLS, TASK_TOOLS, DAILY_TOOLS, CALENDAR_TOOLS, WEB_TOOLS, MEMORY_TOOLS,
  getI18n,
  type AIModel, type AIProvider, type I18n, type Language, type LifeCompanionSettings,
} from "@life-companion/core";
import { readClaudeCodeCredentials } from "./auth";
import { SyncthingClient } from "./syncthing";

interface FetchedModel { id: string; name?: string; supportedGenerationMethods?: string[] }

export class LifeCompanionSettingTab extends PluginSettingTab {
  plugin: LifeCompanionPlugin;
  private collapsed: Record<string, boolean> = {};

  constructor(app: App, plugin: LifeCompanionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private get t(): I18n {
    return getI18n(this.plugin.settings.language);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lc-settings");

    const t = this.t;

    new Setting(containerEl).setName(t.settingsTitle).setHeading();

    // ─── Language ───────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t.language)
      .setDesc(t.languageDesc)
      .addDropdown((dropdown) => {
        dropdown.addOption("en", "English");
        dropdown.addOption("vi", "Tiếng Việt");
        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange((value) => { void (async () => {
          this.plugin.settings.language = value as Language;
          await this.plugin.saveSettings();
          this.display();
        })(); });
      });

    // ─── Default Models ──────────────────────────────────────────
    new Setting(containerEl).setName(t.defaultModels).setHeading();

    const hasAnyProvider = MODEL_GROUPS.some((g) => this.plugin.hasCredentialsFor(g.provider));

    if (!hasAnyProvider) {
      containerEl.createEl("p", {
        text: t.noApiKey("any provider"),
        cls: "setting-item-description",
      });
    } else {
      this.addModelSetting(
        containerEl, t.quickCapture, t.quickCaptureDesc,
        this.plugin.settings.quickModel,
        async (v) => { this.plugin.settings.quickModel = v; await this.plugin.saveSettings(); }
      );

      this.addModelSetting(
        containerEl, t.deepDiveModel, t.deepDiveDesc,
        this.plugin.settings.diveModel,
        async (v) => { this.plugin.settings.diveModel = v; await this.plugin.saveSettings(); }
      );
    }

    // ─── Providers (collapsible per provider) ──────────────────
    new Setting(containerEl).setName(t.apiProviders).setHeading();

    this.renderProviderSection(containerEl, "claude", "Claude (Anthropic)");
    this.renderProviderSection(containerEl, "openai", "OpenAI");
    this.renderProviderSection(containerEl, "gemini", "Gemini (Google)");
    this.renderProviderSection(containerEl, "groq", "Groq");

    // ─── Available Tools ──────────────────────────────────────────
    new Setting(containerEl).setName(t.availableTools).setHeading();
    containerEl.createEl("p", {
      text: t.availableToolsDesc,
      cls: "setting-item-description",
    });

    this.renderToolSection(containerEl, "Vault tools", ALL_TOOLS.filter((t) => t.category === "vault"));
    this.renderToolSection(containerEl, "Knowledge tools", ALL_TOOLS.filter((t) => t.category === "knowledge"));
    this.renderToolSection(containerEl, "Graph tools", ALL_TOOLS.filter((t) => t.category === "graph"));
    this.renderToolSection(containerEl, "Task tools", ALL_TOOLS.filter((t) => t.category === "task"));
    this.renderToolSection(containerEl, "Daily notes tools", ALL_TOOLS.filter((t) => t.category === "daily"));
    this.renderToolSection(containerEl, "Calendar tools", ALL_TOOLS.filter((t) => t.category === "calendar"));
    this.renderToolSection(containerEl, "Web tools", ALL_TOOLS.filter((t) => t.category === "web"));
    this.renderToolSection(containerEl, "Memory & goals tools", ALL_TOOLS.filter((t) => t.category === "memory"));

    // ─── Calendar Settings ──────────────────────────────────
    new Setting(containerEl).setName("Calendar").setHeading();
    const calCard = containerEl.createDiv({ cls: "lc-section-card" });

    new Setting(calCard)
      .setName("Events directory")
      .setDesc("Fallback events directory if Full Calendar auto-detect fails. Leave empty to auto-detect.")
      .addText((text) =>
        text
          .setPlaceholder("calendar")
          .setValue(this.plugin.settings.calendarEventsDirectory)
          .onChange((value) => { void (async () => {
            this.plugin.settings.calendarEventsDirectory = value;
            await this.plugin.saveSettings();
          })(); })
      );

    new Setting(calCard)
      .setName("Week starts on")
      .setDesc("First day of the week in the calendar view.")
      .addDropdown((drop) =>
        drop
          .addOptions({ "1": "Monday", "0": "Sunday", "6": "Saturday" })
          .setValue(String(this.plugin.settings.calendarStartDay ?? 1))
          .onChange((value) => { void (async () => {
            this.plugin.settings.calendarStartDay = Number(value) as 0 | 1 | 6;
            await this.plugin.saveSettings();
          })(); })
      );

    // ─── Web Search ────────────────────────────────────────────
    new Setting(containerEl).setName("Web search").setHeading();
    const webCard = containerEl.createDiv({ cls: "lc-section-card" });

    const braveKey = this.plugin.settings.braveSearchApiKey;
    if (braveKey) {
      new Setting(webCard)
        .setName("Brave Search API")
        .setDesc("Connected — 2,000 free queries/month. Falls back to DuckDuckGo when quota exceeded.")
        .addButton((btn) =>
          btn.setButtonText("Remove").onClick(() => { void (async () => {
            this.plugin.settings.braveSearchApiKey = "";
            await this.plugin.saveSettings();
            this.display();
          })(); })
        );
    } else {
      let keyValue = "";
      new Setting(webCard)
        .setName("Brave Search API key")
        .setDesc("Optional — get free key at brave.com/search/api (2,000 queries/month). Without it, DuckDuckGo is used.")
        .addText((text) =>
          text.setPlaceholder("BSA...").onChange((v) => { keyValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText("Save").onClick(() => { void (async () => {
            if (!keyValue.trim()) return;
            this.plugin.settings.braveSearchApiKey = keyValue.trim();
            await this.plugin.saveSettings();
            new Notice("Brave Search API key saved");
            this.display();
          })(); })
        );
    }

    // ─── Snapshots ─────────────────────────────────────────────
    new Setting(containerEl).setName("Snapshots").setHeading();
    const snapCard = containerEl.createDiv({ cls: "lc-section-card" });

    new Setting(snapCard)
      .setName("Enable note snapshots")
      .setDesc("Automatically save previous versions when a note is overwritten. Uses extra vault storage.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.snapshotsEnabled)
          .onChange((value) => { void (async () => {
            this.plugin.settings.snapshotsEnabled = value;
            await this.plugin.saveSettings();
            this.display();
          })(); })
      );

    if (this.plugin.settings.snapshotsEnabled) {
      new Setting(snapCard)
        .setName("Max snapshots per note")
        .setDesc("Maximum number of previous versions to keep per note (older ones are deleted automatically)")
        .addSlider((slider) =>
          slider
            .setLimits(1, 10, 1)
            .setValue(this.plugin.settings.maxSnapshotsPerFile)
            .setDynamicTooltip()
            .onChange((value) => { void (async () => {
              this.plugin.settings.maxSnapshotsPerFile = value;
              await this.plugin.saveSettings();
            })(); })
        );
    }

    // ─── Vault Sync ──────────────────────────────────────────────
    new Setting(containerEl).setName("Vault sync").setHeading();
    const syncCard = containerEl.createDiv({ cls: "lc-section-card" });
    syncCard.createEl("p", {
      text: "Sync your vault with a server for Telegram bot, scheduled briefings, and mobile access.",
      cls: "lc-section-desc",
    });

    this.renderSyncSection(syncCard);
  }

  // ─── Vault Sync Section ────────────────────────────────────────

  private renderSyncSection(containerEl: HTMLElement) {
    const syncthing = new SyncthingClient();
    const statusEl = containerEl.createDiv({ cls: "lc-sync-status" });

    // Check Syncthing status async
    this.checkSyncStatus(syncthing, containerEl, statusEl);
  }

  private async checkSyncStatus(syncthing: SyncthingClient, containerEl: HTMLElement, statusEl: HTMLElement) {
    statusEl.empty();

    const running = await syncthing.isRunning();

    if (!running) {
      // Syncthing not detected
      const installCmd = SyncthingClient.getInstallCommand();

      new Setting(statusEl)
        .setName("Syncthing")
        .setDesc("Not detected — install Syncthing to enable vault sync.")
        .addButton((btn) =>
          btn.setButtonText("How to install").onClick(() => {
            const infoEl = statusEl.createDiv({ cls: "lc-install-guide lc-settings-info" });
            infoEl.createEl("p", { text: "Run this in your terminal:" });
            const codeBlock = infoEl.createEl("pre", { cls: "lc-settings-code" });
            codeBlock.textContent = installCmd;
            infoEl.createEl("p", { text: "Then click Re-check below." });
            btn.setDisabled(true);
          })
        );

      new Setting(statusEl)
        .setName("")
        .addButton((btn) =>
          btn.setButtonText("Re-check").onClick(() => {
            this.display();
          })
        );
      return;
    }

    // Syncthing is running — load API key
    const hasKey = await syncthing.loadApiKey();
    if (!hasKey) {
      new Setting(statusEl)
        .setName("Syncthing")
        .setDesc("Running but could not read API key. Check Syncthing config.xml permissions.");
      return;
    }

    // Connected to Syncthing
    if (this.plugin.settings.syncEnabled && this.plugin.settings.syncDeviceId) {
      // Already configured — show status
      const folderStatus = await syncthing.getFolderStatus("lc-vault");
      let stateText = "Checking...";
      if (folderStatus) {
        const stateMap: Record<string, string> = {
          idle: "Up to date",
          scanning: "Scanning files...",
          syncing: "Syncing...",
          error: "Error",
          "sync-preparing": "Preparing sync...",
        };
        const label = stateMap[folderStatus.state] || folderStatus.state;
        stateText = `${label} · ${folderStatus.globalFiles} files`;
      }

      new Setting(statusEl)
        .setName("Syncthing")
        .setDesc(`Connected · ${stateText}`)
        .addButton((btn) =>
          btn.setButtonText("Disconnect").onClick(() => { void (async () => {
            this.plugin.settings.syncDeviceId = "";
            this.plugin.settings.syncEnabled = false;
            await this.plugin.saveSettings();
            this.display();
          })(); })
        )
        .addButton((btn) =>
          btn.setButtonText("Refresh").onClick(() => {
            this.display();
          })
        );
    } else {
      // Not configured — show connect form
      new Setting(statusEl)
        .setName("Syncthing")
        .setDesc("Running — enter the server device ID to connect.");

      let deviceIdValue = "";
      new Setting(statusEl)
        .setName("Server device ID")
        .setDesc("Shown at the end of the server setup script")
        .addText((text) =>
          text
            .setPlaceholder("XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX")
            .onChange((v) => { deviceIdValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText("Connect").setCta().onClick(() => { void (async () => {
            const id = deviceIdValue.trim();
            if (!id) { new Notice("Enter the server device ID first"); return; }

            btn.setButtonText("Connecting...");
            btn.setDisabled(true);

            // Add device
            const added = await syncthing.addDevice(id, "Life Companion Server");
            if (!added) {
              new Notice("Failed to add device. Check the device ID and try again.");
              btn.setButtonText("Connect");
              btn.setDisabled(false);
              return;
            }

            // Get vault path from Obsidian
            const vaultPath = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.()
              || (this.app.vault.adapter as unknown as { basePath?: string }).basePath || "";

            if (!vaultPath) {
              new Notice("Could not detect vault path");
              btn.setButtonText("Connect");
              btn.setDisabled(false);
              return;
            }

            // Share folder
            const shared = await syncthing.shareFolder("lc-vault", vaultPath, id);
            if (!shared) {
              new Notice("Failed to configure sync folder. Check Syncthing web UI.");
              btn.setButtonText("Connect");
              btn.setDisabled(false);
              return;
            }

            // Save settings
            this.plugin.settings.syncDeviceId = id;
            this.plugin.settings.syncEnabled = true;
            await this.plugin.saveSettings();
            new Notice("Vault sync configured! Syncing will start shortly.");
            this.display();
          })(); })
        );

      // Server setup link
      const serverHint = containerEl.createEl("p", { cls: "setting-item-description" });
      serverHint.appendText("Need a server? Run ");
      serverHint.createEl("code", { text: "curl -fsSL https://raw.githubusercontent.com/tranvuongquocdat/life-companion-AI/main/scripts/setup.sh | bash" });
      serverHint.appendText(" on your server machine. ");
      serverHint.createEl("a", { text: "Setup guide", href: "https://github.com/tranvuongquocdat/life-companion-AI#telegram-bot--server-optional" });
    }
  }

  // ─── Collapsible Provider Section ───────────────────────────────

  private renderProviderSection(containerEl: HTMLElement, provider: AIProvider, label: string) {
    const t = this.t;
    const hasKey = this.plugin.hasCredentialsFor(provider);
    const isCollapsed = this.collapsed[provider] ?? true; // default: collapsed

    // Card container
    const card = containerEl.createDiv({ cls: "lc-provider-card" });

    // Header (clickable)
    const header = card.createDiv({ cls: "lc-provider-header" });

    const arrow = header.createSpan({ cls: "lc-provider-arrow" });
    arrow.textContent = isCollapsed ? "\u25B8" : "\u25BE";

    header.createSpan({ cls: "lc-provider-name", text: label });

    if (hasKey) {
      header.createSpan({ cls: "lc-connected-badge", text: t.connected });
    } else {
      header.createSpan({ cls: "lc-group-badge", text: t.noApiKeyBadge });
    }

    // Body (collapsible)
    const body = card.createDiv({ cls: "lc-provider-body" });
    if (isCollapsed) body.addClass("lc-collapsed");

    header.addEventListener("click", () => {
      const nowCollapsed = !(this.collapsed[provider] ?? true);
      this.collapsed[provider] = nowCollapsed;
      body.toggleClass("lc-collapsed", nowCollapsed);
      arrow.textContent = nowCollapsed ? "\u25B8" : "\u25BE";
    });

    // Connection setup
    this.renderProviderConnection(body, provider, label);

    // Refresh + Model toggles
    const groups = getEffectiveModelGroups(this.plugin.settings.customModels);
    const group = groups.find((g) => g.provider === provider);
    if (group && hasKey) {
      // Refresh models from API
      new Setting(body)
        .setName(t.refreshModels)
        .addButton((btn) =>
          btn.setButtonText("↻ Refresh").onClick(() => { void (async () => {
            btn.setButtonText("...");
            btn.setDisabled(true);
            const models = await this.fetchModelsForProvider(provider);
            if (models.length > 0) {
              if (!this.plugin.settings.customModels) this.plugin.settings.customModels = {};
              this.plugin.settings.customModels[provider] = models;
              await this.plugin.saveSettings();
              new Notice(t.modelsUpdated(models.length));
              this.display();
            } else {
              new Notice(t.noModelsFound);
              btn.setButtonText("↻ Refresh");
              btn.setDisabled(false);
            }
          })(); })
        );

      const modelsLabel = body.createDiv({ cls: "lc-section-label" });
      modelsLabel.textContent = t.enabledModels;

      for (const model of group.models) {
        const s = new Setting(body)
          .setName(model.name)
          .setDesc(model.id)
          .addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings.enabledModels.includes(model.id))
              .onChange((value) => { void (async () => {
                if (value) {
                  this.plugin.settings.enabledModels.push(model.id);
                } else {
                  if (this.plugin.settings.enabledModels.length <= 1) {
                    new Notice(t.mustHaveOneModel);
                    toggle.setValue(true);
                    return;
                  }
                  this.plugin.settings.enabledModels =
                    this.plugin.settings.enabledModels.filter((m) => m !== model.id);
                }
                await this.plugin.saveSettings();
              })(); });
          });
        s.settingEl.addClass("lc-compact-item");
        const descEl = s.settingEl.querySelector(".setting-item-description");
        if (descEl) descEl.addClass("lc-model-id");
      }
    }
  }

  // ─── Provider Connection (API key / OAuth) ──────────────────────

  private renderProviderConnection(body: HTMLElement, provider: AIProvider, label: string) {
    const t = this.t;

    if (provider === "claude") {
      this.renderClaudeConnection(body);
      return;
    }

    const keyField = {
      openai: "openaiApiKey" as const,
      gemini: "geminiApiKey" as const,
      groq: "groqApiKey" as const,
    }[provider]!;

    const placeholder = {
      openai: "sk-...",
      gemini: "AIza...",
      groq: "gsk_...",
    }[provider]!;

    const currentKey = this.plugin.settings[keyField];

    if (currentKey) {
      new Setting(body)
        .setName(t.connectedVia("API key"))
        .addButton((btn) =>
          btn.setButtonText(t.removeKey).onClick(() => { void (async () => {
            this.plugin.settings[keyField as keyof LifeCompanionSettings] = "" as never;
            const group = getEffectiveModelGroups(this.plugin.settings.customModels).find((g) => g.provider === provider);
            if (group) {
              const ids = group.models.map((m) => m.id);
              this.plugin.settings.enabledModels =
                this.plugin.settings.enabledModels.filter((m) => !ids.includes(m));
            }
            if (this.plugin.settings.customModels?.[provider]) {
              delete this.plugin.settings.customModels[provider];
            }
            await this.plugin.saveSettings();
            this.display();
          })(); })
        );
    } else {
      let keyValue = "";
      new Setting(body)
        .setName("API key")
        .addText((text) =>
          text.setPlaceholder(placeholder).onChange((v) => { keyValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText(t.verifySave).onClick(() => { void (async () => {
            if (!keyValue.trim()) { new Notice(t.enterKeyFirst); return; }
            btn.setButtonText("...");
            btn.setDisabled(true);
            const ok = await this.verifyApiKey(provider, keyValue.trim());
            if (ok) {
              this.plugin.settings[keyField as keyof LifeCompanionSettings] = keyValue.trim() as never;
              await this.plugin.saveSettings();
              new Notice(t.keyVerified(label));
              this.display();
            } else {
              new Notice(t.invalidKey);
              btn.setButtonText(t.verifySave);
              btn.setDisabled(false);
            }
          })(); })
        );
    }
  }

  private renderClaudeConnection(body: HTMLElement) {
    const t = this.t;

    if (this.plugin.settings.accessToken) {
      new Setting(body)
        .setName(t.connectedVia("Claude Code"))
        .addButton((btn) =>
          btn.setButtonText(t.disconnect).onClick(() => { void (async () => {
            this.plugin.settings.accessToken = "";
            this.plugin.settings.refreshToken = "";
            this.plugin.settings.tokenExpiresAt = 0;
            await this.plugin.saveSettings();
            this.display();
          })(); })
        );
    } else if (this.plugin.settings.claudeApiKey) {
      new Setting(body)
        .setName(t.connectedVia("API key"))
        .addButton((btn) =>
          btn.setButtonText(t.removeKey).onClick(() => { void (async () => {
            this.plugin.settings.claudeApiKey = "";
            await this.plugin.saveSettings();
            this.display();
          })(); })
        );
    } else {
      const s = new Setting(body).setName("Claude Code");
      s.addButton((btn) =>
        btn
          .setButtonText(t.claudeCodeLogin)
          .setCta()
          .onClick(() => { void (async () => {
            try {
              const tokens = readClaudeCodeCredentials();
              this.plugin.settings.accessToken = tokens.accessToken;
              this.plugin.settings.refreshToken = tokens.refreshToken;
              this.plugin.settings.tokenExpiresAt = tokens.expiresAt;
              await this.plugin.saveSettings();
              new Notice(t.connectedClaudeCode);
              this.display();
            } catch (e) {
              new Notice(`Error: ${(e as Error).message}`);
            }
          })(); })
      );

      let keyValue = "";
      new Setting(body)
        .setName(t.orEnterApiKey)
        .addText((text) =>
          text.setPlaceholder("sk-ant-...").onChange((v) => { keyValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText(t.verifySave).onClick(() => { void (async () => {
            if (!keyValue.trim()) { new Notice(t.enterKeyFirst); return; }
            btn.setButtonText("...");
            btn.setDisabled(true);
            const ok = await this.verifyApiKey("claude", keyValue.trim());
            if (ok) {
              this.plugin.settings.claudeApiKey = keyValue.trim();
              await this.plugin.saveSettings();
              new Notice(t.keyVerified("Claude"));
              this.display();
            } else {
              new Notice(t.invalidKey);
              btn.setButtonText(t.verifySave);
              btn.setDisabled(false);
            }
          })(); })
        );
    }
  }

  // ─── Tool Section ──────────────────────────────────────────────

  private getToolDetailedDescriptions(): Record<string, string> {
    const all = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...CALENDAR_TOOLS, ...WEB_TOOLS, ...MEMORY_TOOLS];
    return Object.fromEntries(all.map((t) => [t.name, t.description]));
  }

  private renderToolSection(containerEl: HTMLElement, label: string, tools: typeof ALL_TOOLS) {
    const collapseKey = `tools-${label}`;
    const isCollapsed = this.collapsed[collapseKey] ?? true;
    const enabledCount = tools.filter((t) => this.plugin.settings.enabledTools.includes(t.name)).length;

    const card = containerEl.createDiv({ cls: "lc-provider-card" });

    // Header
    const header = card.createDiv({ cls: "lc-provider-header" });
    const arrow = header.createSpan({ cls: "lc-provider-arrow" });
    arrow.textContent = isCollapsed ? "\u25B8" : "\u25BE";
    header.createSpan({ cls: "lc-provider-name", text: label });
    header.createSpan({ cls: "lc-group-badge", text: `${enabledCount}/${tools.length}` });

    // Body
    const body = card.createDiv({ cls: "lc-provider-body" });
    if (isCollapsed) body.addClass("lc-collapsed");

    header.addEventListener("click", () => {
      const nowCollapsed = !(this.collapsed[collapseKey] ?? true);
      this.collapsed[collapseKey] = nowCollapsed;
      body.toggleClass("lc-collapsed", nowCollapsed);
      arrow.textContent = nowCollapsed ? "\u25B8" : "\u25BE";
    });

    const detailedDescs = this.getToolDetailedDescriptions();

    for (const tool of tools) {
      const s = new Setting(body)
        .setName(tool.displayName)
        .setDesc(tool.description)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.enabledTools.includes(tool.name))
            .onChange((value) => { void (async () => {
              if (value) {
                this.plugin.settings.enabledTools.push(tool.name);
              } else {
                this.plugin.settings.enabledTools =
                  this.plugin.settings.enabledTools.filter((n) => n !== tool.name);
              }
              await this.plugin.saveSettings();
            })(); });
        });
      s.settingEl.addClass("lc-compact-item");

      // Add info icon inline next to the name
      const nameEl = s.settingEl.querySelector(".setting-item-name");
      if (nameEl) {
        const infoBtn = createEl("span", { cls: "lc-tool-info-btn", text: "!" });
        nameEl.appendChild(infoBtn);

        const detailEl = createEl("div", {
          cls: "lc-tool-detail lc-hidden",
          text: detailedDescs[tool.name] || tool.description,
        });
        s.settingEl.after(detailEl);

        infoBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isVisible = !detailEl.hasClass("lc-hidden");
          detailEl.toggleClass("lc-hidden", isVisible);
          infoBtn.toggleClass("lc-tool-info-btn-active", !isVisible);
        });
      }
    }
  }

  // ─── API Key Verification ─────────────────────────────────────

  private async verifyApiKey(provider: AIProvider, key: string): Promise<boolean> {
    try {
      let response;
      switch (provider) {
        case "claude":
          response = await requestUrl({
            url: "https://api.anthropic.com/v1/messages",
            method: "POST",
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
            throw: false,
          });
          return response.status !== 401 && response.status !== 403;

        case "openai":
          response = await requestUrl({
            url: "https://api.openai.com/v1/models",
            headers: { Authorization: `Bearer ${key}` },
            throw: false,
          });
          return response.status === 200;

        case "gemini":
          response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            throw: false,
          });
          return response.status === 200;

        case "groq":
          response = await requestUrl({
            url: "https://api.groq.com/openai/v1/models",
            headers: { Authorization: `Bearer ${key}` },
            throw: false,
          });
          return response.status === 200;
      }
    } catch (e) {
      console.debug("API key verification failed:", e);
      return false;
    }
  }

  // ─── Fetch Models from Provider API ────────────────────────────

  private async fetchModelsForProvider(provider: AIProvider): Promise<{ id: string; name: string }[]> {
    try {
      switch (provider) {
        case "claude": {
          const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
          if (this.plugin.settings.claudeApiKey) {
            headers["x-api-key"] = this.plugin.settings.claudeApiKey;
          } else if (this.plugin.settings.accessToken) {
            headers["Authorization"] = `Bearer ${this.plugin.settings.accessToken}`;
          }
          const res = await requestUrl({ url: "https://api.anthropic.com/v1/models?limit=100", headers, throw: false });
          if (res.status !== 200) return [];
          return (res.json.data || [])
            .filter((m: FetchedModel) => !m.id.match(/-\d{8}$/))
            .map((m: FetchedModel) => ({ id: m.id, name: (m as FetchedModel & { display_name?: string }).display_name || m.id }))
            .sort((a: FetchedModel, b: FetchedModel) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
        }
        case "openai": {
          const res = await requestUrl({
            url: "https://api.openai.com/v1/models",
            headers: { Authorization: `Bearer ${this.plugin.settings.openaiApiKey}` },
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.data || [])
            .filter((m: FetchedModel) => /^(gpt-|o[134]|chatgpt-)/.test(m.id))
            .filter((m: FetchedModel) => !/(realtime|audio|search|transcrib)/.test(m.id))
            .map((m: FetchedModel) => ({ id: m.id, name: m.id }))
            .sort((a: FetchedModel, b: FetchedModel) => a.id.localeCompare(b.id));
        }
        case "gemini": {
          const res = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${this.plugin.settings.geminiApiKey}`,
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.models || [])
            .filter((m: FetchedModel) => m.supportedGenerationMethods?.includes("generateContent"))
            .filter((m: FetchedModel) => m.name?.includes("gemini"))
            .map((m: FetchedModel & { displayName?: string }) => ({ id: (m.name ?? m.id).replace("models/", ""), name: m.displayName || m.name || m.id }))
            .sort((a: FetchedModel, b: FetchedModel) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
        }
        case "groq": {
          const res = await requestUrl({
            url: "https://api.groq.com/openai/v1/models",
            headers: { Authorization: `Bearer ${this.plugin.settings.groqApiKey}` },
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.data || [])
            .map((m: FetchedModel) => ({ id: m.id, name: m.id }))
            .sort((a: FetchedModel, b: FetchedModel) => a.id.localeCompare(b.id));
        }
      }
    } catch (e) {
      console.debug("Model fetch failed:", e);
      return [];
    }
  }

  // ─── Model Setting ─────────────────────────────────────────────

  private addModelSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    currentValue: AIModel,
    onChange: (v: AIModel) => Promise<void>
  ) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addDropdown((dropdown) => {
        for (const group of getEffectiveModelGroups(this.plugin.settings.customModels)) {
          if (!this.plugin.hasCredentialsFor(group.provider)) continue;
          for (const model of group.models) {
            dropdown.addOption(model.id, `${group.label} / ${model.name}`);
          }
        }
        dropdown.setValue(currentValue);
        dropdown.onChange((value) => { void onChange(value as AIModel); });
      });
  }
}
