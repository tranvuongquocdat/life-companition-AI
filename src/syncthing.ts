import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { requestUrl, Platform } from "obsidian";

export class SyncthingClient {
  private apiKey: string = "";
  private baseUrl = "http://localhost:8384";

  // ── Helpers ──────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return { "X-API-Key": this.apiKey };
  }

  private async apiGet(endpoint: string): Promise<Record<string, unknown>> {
    const res = await requestUrl({
      url: `${this.baseUrl}${endpoint}`,
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    return res.json as Record<string, unknown>;
  }

  private async apiPut(endpoint: string, body: Record<string, unknown>): Promise<void> {
    await requestUrl({
      url: `${this.baseUrl}${endpoint}`,
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      throw: false,
    });
  }

  // ── Public API ───────────────────────────────────────────────────────

  /** Check if Syncthing is running on localhost:8384. */
  async isRunning(): Promise<boolean> {
    try {
      await requestUrl({
        url: `${this.baseUrl}/rest/system/ping`,
        method: "GET",
        headers: this.apiKey ? this.headers() : {},
        throw: false,
      });
      return true;
    } catch (e) {
      console.debug("Syncthing ping failed:", e);
      return false;
    }
  }

  /**
   * Read API key from Syncthing config.xml on disk.
   * Platform-aware paths: macOS, Linux, Windows.
   */
  loadApiKey(): boolean {
    try {
      const home = os.homedir();
      const candidates: string[] = [];

      if (Platform.isMacOS) {
        candidates.push(
          path.join(home, "Library", "Application Support", "Syncthing", "config.xml"),
        );
      } else if (Platform.isLinux) {
        candidates.push(
          path.join(home, ".local", "state", "syncthing", "config.xml"),
          path.join(home, ".config", "syncthing", "config.xml"),
        );
      } else if (Platform.isWin) {
        const localAppData =
          process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
        candidates.push(path.join(localAppData, "Syncthing", "config.xml"));
      }

      for (const configPath of candidates) {
        try {
          const xml = fs.readFileSync(configPath, "utf-8");
          const match = xml.match(/<apikey>(.+?)<\/apikey>/);
          if (match?.[1]) {
            this.apiKey = match[1];
            return true;
          }
        } catch (e) {
          console.debug("Syncthing config not found at candidate:", e);
        }
      }

      return false;
    } catch (e) {
      console.debug("Syncthing API key load failed:", e);
      return false;
    }
  }

  /** Get this device's Syncthing Device ID. */
  async getDeviceId(): Promise<string | null> {
    try {
      const status = await this.apiGet("/rest/system/status");
      return typeof status?.myID === "string" ? status.myID : null;
    } catch (e) {
      console.debug("Syncthing getDeviceId failed:", e);
      return null;
    }
  }

  /** Add a remote device. No-op if already exists. */
  async addDevice(deviceId: string, name: string): Promise<boolean> {
    try {
      if (await this.hasDevice(deviceId)) return true;

      const config = await this.apiGet("/rest/config");
      if (!config.devices) config.devices = [];
      const devices = config.devices as Record<string, unknown>[];
      devices.push({
        deviceID: deviceId,
        name,
        addresses: ["dynamic"],
        compression: "metadata",
        introducer: false,
        paused: false,
      });

      await this.apiPut("/rest/config", config);
      return true;
    } catch (e) {
      console.debug("Syncthing addDevice failed:", e);
      return false;
    }
  }

  /** Check if a device is already configured. */
  async hasDevice(deviceId: string): Promise<boolean> {
    try {
      const config = await this.apiGet("/rest/config");
      const devices = (config?.devices ?? []) as { deviceID?: string }[];
      return devices.some(
        (d) => d.deviceID?.toUpperCase() === deviceId.toUpperCase(),
      );
    } catch (e) {
      console.debug("Syncthing hasDevice failed:", e);
      return false;
    }
  }

  /**
   * Share a folder with a remote device.
   * Creates or updates folder config with both local and remote device.
   */
  async shareFolder(
    folderId: string,
    folderPath: string,
    deviceId: string,
  ): Promise<boolean> {
    try {
      const localId = await this.getDeviceId();
      if (!localId) return false;

      const config = await this.apiGet("/rest/config");
      if (!config.folders) config.folders = [];
      const folders = config.folders as Record<string, unknown>[];

      const requiredDevices = [
        { deviceID: localId, introducedBy: "" },
        { deviceID: deviceId, introducedBy: "" },
      ];

      const existing = folders.find((f) => f.id === folderId);

      if (existing) {
        const existingDevices = (existing.devices ?? []) as { deviceID?: string }[];
        const existingIds = new Set(
          existingDevices.map((d) => d.deviceID?.toUpperCase()),
        );
        for (const rd of requiredDevices) {
          if (!existingIds.has(rd.deviceID.toUpperCase())) {
            existingDevices.push(rd);
          }
        }
        existing.path = folderPath;
      } else {
        folders.push({
          id: folderId,
          label: "Life Companion Vault",
          path: folderPath,
          type: "sendreceive",
          devices: requiredDevices,
          rescanIntervalS: 60,
          fsWatcherEnabled: true,
          fsWatcherDelayS: 10,
          ignorePerms: false,
          autoNormalize: true,
        });
      }

      await this.apiPut("/rest/config", config);
      return true;
    } catch (e) {
      console.debug("Syncthing shareFolder failed:", e);
      return false;
    }
  }

  /** Get sync status for a folder. */
  async getFolderStatus(
    folderId: string,
  ): Promise<{ state: string; needFiles: number; globalFiles: number } | null> {
    try {
      const status = await this.apiGet(
        `/rest/db/status?folder=${encodeURIComponent(folderId)}`,
      );
      return {
        state: typeof status?.state === "string" ? status.state : "unknown",
        needFiles: typeof status?.needFiles === "number" ? status.needFiles : 0,
        globalFiles: typeof status?.globalFiles === "number" ? status.globalFiles : 0,
      };
    } catch (e) {
      console.debug("Syncthing getFolderStatus failed:", e);
      return null;
    }
  }

  /** Platform-appropriate install command. */
  static getInstallCommand(): string {
    if (Platform.isMacOS) return "brew install syncthing && brew services start syncthing";
    if (Platform.isLinux) return "sudo apt install syncthing && systemctl --user enable syncthing && systemctl --user start syncthing";
    if (Platform.isWin) return "choco install syncthing";
    return "https://syncthing.net/downloads/";
  }
}