import { App, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type LifeCompanionPlugin from "./main";
import { ALL_TOOLS, MODEL_GROUPS, getEffectiveModelGroups, type AIModel, type AIProvider } from "./types";
import { VAULT_TOOLS, KNOWLEDGE_TOOLS, GRAPH_TOOLS, TASK_TOOLS, DAILY_TOOLS, CALENDAR_TOOLS, WEB_TOOLS } from "./tool-definitions";
import { readClaudeCodeCredentials } from "./auth";
import { getI18n, type I18n, type Language } from "./i18n";

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

    containerEl.createEl("h2", { text: t.settingsTitle });

    // ─── Language ───────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t.language)
      .setDesc(t.languageDesc)
      .addDropdown((dropdown) => {
        dropdown.addOption("en", "English");
        dropdown.addOption("vi", "Tiếng Việt");
        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange(async (value) => {
          this.plugin.settings.language = value as Language;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // ─── Default Models ──────────────────────────────────────────
    containerEl.createEl("h3", { text: t.defaultModels });

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
    containerEl.createEl("h3", { text: t.apiProviders });

    this.renderProviderSection(containerEl, "claude", "Claude (Anthropic)");
    this.renderProviderSection(containerEl, "openai", "OpenAI");
    this.renderProviderSection(containerEl, "gemini", "Gemini (Google)");
    this.renderProviderSection(containerEl, "groq", "Groq");

    // ─── Available Tools ──────────────────────────────────────────
    containerEl.createEl("h3", { text: t.availableTools });
    containerEl.createEl("p", {
      text: t.availableToolsDesc,
      cls: "setting-item-description",
    });

    this.renderToolSection(containerEl, "Vault Tools", ALL_TOOLS.filter((t) => t.category === "vault"));
    this.renderToolSection(containerEl, "Knowledge Tools", ALL_TOOLS.filter((t) => t.category === "knowledge"));
    this.renderToolSection(containerEl, "Graph Tools", ALL_TOOLS.filter((t) => t.category === "graph"));
    this.renderToolSection(containerEl, "Task Tools", ALL_TOOLS.filter((t) => t.category === "task"));
    this.renderToolSection(containerEl, "Daily Notes Tools", ALL_TOOLS.filter((t) => t.category === "daily"));
    this.renderToolSection(containerEl, "Calendar Tools", ALL_TOOLS.filter((t) => t.category === "calendar"));
    this.renderToolSection(containerEl, "Web Tools", ALL_TOOLS.filter((t) => t.category === "web"));

    // ─── Calendar Settings ──────────────────────────────────
    containerEl.createEl("h3", { text: "Calendar" });

    new Setting(containerEl)
      .setName("Events Directory")
      .setDesc("Fallback events directory if Full Calendar auto-detect fails. Leave empty to auto-detect.")
      .addText((text) =>
        text
          .setPlaceholder("calendar")
          .setValue(this.plugin.settings.calendarEventsDirectory)
          .onChange(async (value) => {
            this.plugin.settings.calendarEventsDirectory = value;
            await this.plugin.saveSettings();
          })
      );
  }

  // ─── Collapsible Provider Section ───────────────────────────────

  private renderProviderSection(containerEl: HTMLElement, provider: AIProvider, label: string) {
    const t = this.t;
    const hasKey = this.plugin.hasCredentialsFor(provider);
    const isCollapsed = this.collapsed[provider] ?? !hasKey; // default: collapsed if no key

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
      this.collapsed[provider] = !this.collapsed[provider];
      const nowCollapsed = this.collapsed[provider];
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
          btn.setButtonText("↻ Refresh").onClick(async () => {
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
          })
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
              .onChange(async (value) => {
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
              });
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
        .setName(t.connectedVia("API Key"))
        .addButton((btn) =>
          btn.setButtonText(t.removeKey).onClick(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.plugin.settings as any)[keyField] = "";
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
          })
        );
    } else {
      let keyValue = "";
      new Setting(body)
        .setName("API Key")
        .addText((text) =>
          text.setPlaceholder(placeholder).onChange((v) => { keyValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText(t.verifySave).onClick(async () => {
            if (!keyValue.trim()) { new Notice(t.enterKeyFirst); return; }
            btn.setButtonText("...");
            btn.setDisabled(true);
            const ok = await this.verifyApiKey(provider, keyValue.trim());
            if (ok) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (this.plugin.settings as any)[keyField] = keyValue.trim();
              await this.plugin.saveSettings();
              new Notice(t.keyVerified(label));
              this.display();
            } else {
              new Notice(t.invalidKey);
              btn.setButtonText(t.verifySave);
              btn.setDisabled(false);
            }
          })
        );
    }
  }

  private renderClaudeConnection(body: HTMLElement) {
    const t = this.t;

    if (this.plugin.settings.accessToken) {
      new Setting(body)
        .setName(t.connectedVia("Claude Code"))
        .addButton((btn) =>
          btn.setButtonText(t.disconnect).onClick(async () => {
            this.plugin.settings.accessToken = "";
            this.plugin.settings.refreshToken = "";
            this.plugin.settings.tokenExpiresAt = 0;
            await this.plugin.saveSettings();
            this.display();
          })
        );
    } else if (this.plugin.settings.claudeApiKey) {
      new Setting(body)
        .setName(t.connectedVia("API Key"))
        .addButton((btn) =>
          btn.setButtonText(t.removeKey).onClick(async () => {
            this.plugin.settings.claudeApiKey = "";
            await this.plugin.saveSettings();
            this.display();
          })
        );
    } else {
      const s = new Setting(body).setName("Claude Code");
      s.addButton((btn) =>
        btn
          .setButtonText(t.claudeCodeLogin)
          .setCta()
          .onClick(async () => {
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
          })
      );

      let keyValue = "";
      new Setting(body)
        .setName(t.orEnterApiKey)
        .addText((text) =>
          text.setPlaceholder("sk-ant-...").onChange((v) => { keyValue = v; })
        )
        .addButton((btn) =>
          btn.setButtonText(t.verifySave).onClick(async () => {
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
          })
        );
    }
  }

  // ─── Tool Section ──────────────────────────────────────────────

  private getToolDetailedDescriptions(): Record<string, string> {
    const all = [...VAULT_TOOLS, ...KNOWLEDGE_TOOLS, ...GRAPH_TOOLS, ...TASK_TOOLS, ...DAILY_TOOLS, ...CALENDAR_TOOLS, ...WEB_TOOLS];
    return Object.fromEntries(all.map((t) => [t.name, t.description]));
  }

  private renderToolSection(containerEl: HTMLElement, label: string, tools: typeof ALL_TOOLS) {
    const header = containerEl.createDiv({ cls: "lc-tool-group-header" });
    header.createEl("span", { cls: "lc-tool-group-label", text: label });

    const detailedDescs = this.getToolDetailedDescriptions();

    for (const tool of tools) {
      const s = new Setting(containerEl)
        .setName(tool.displayName)
        .setDesc(tool.description)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.enabledTools.includes(tool.name))
            .onChange(async (value) => {
              if (value) {
                this.plugin.settings.enabledTools.push(tool.name);
              } else {
                this.plugin.settings.enabledTools =
                  this.plugin.settings.enabledTools.filter((n) => n !== tool.name);
              }
              await this.plugin.saveSettings();
            });
        });
      s.settingEl.addClass("lc-compact-item");

      // Add info icon inline next to the name
      const nameEl = s.settingEl.querySelector(".setting-item-name");
      if (nameEl) {
        const infoBtn = createEl("span", { cls: "lc-tool-info-btn", text: "!" });
        nameEl.appendChild(infoBtn);

        // Detail panel goes after the whole setting row
        const detailEl = createEl("div", {
          cls: "lc-tool-detail",
          text: detailedDescs[tool.name] || tool.description,
        });
        detailEl.style.display = "none";
        s.settingEl.after(detailEl);

        infoBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isVisible = detailEl.style.display !== "none";
          detailEl.style.display = isVisible ? "none" : "block";
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
    } catch {
      return false;
    }
  }

  // ─── Fetch Models from Provider API ────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            .filter((m: any) => !m.id.match(/-\d{8}$/)) // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((m: any) => ({ id: m.id, name: m.display_name || m.id })) // eslint-disable-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => a.name.localeCompare(b.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        case "openai": {
          const res = await requestUrl({
            url: "https://api.openai.com/v1/models",
            headers: { Authorization: `Bearer ${this.plugin.settings.openaiApiKey}` },
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.data || [])
            .filter((m: any) => /^(gpt-|o[134]|chatgpt-)/.test(m.id)) // eslint-disable-line @typescript-eslint/no-explicit-any
            .filter((m: any) => !/(realtime|audio|search|transcrib)/.test(m.id)) // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((m: any) => ({ id: m.id, name: m.id })) // eslint-disable-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => a.id.localeCompare(b.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        case "gemini": {
          const res = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${this.plugin.settings.geminiApiKey}`,
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.models || [])
            .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent")) // eslint-disable-line @typescript-eslint/no-explicit-any
            .filter((m: any) => m.name?.includes("gemini")) // eslint-disable-line @typescript-eslint/no-explicit-any
            .map((m: any) => ({ id: m.name.replace("models/", ""), name: m.displayName || m.name })) // eslint-disable-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => a.name.localeCompare(b.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
        case "groq": {
          const res = await requestUrl({
            url: "https://api.groq.com/openai/v1/models",
            headers: { Authorization: `Bearer ${this.plugin.settings.groqApiKey}` },
            throw: false,
          });
          if (res.status !== 200) return [];
          return (res.json.data || [])
            .map((m: any) => ({ id: m.id, name: m.id })) // eslint-disable-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => a.id.localeCompare(b.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }
    } catch {
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
        dropdown.onChange((value) => onChange(value as AIModel));
      });
  }
}
