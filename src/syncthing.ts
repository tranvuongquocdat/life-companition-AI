import { requestUrl, Platform } from "obsidian";

const fs = require("fs") as typeof import("fs");
const os = require("os") as typeof import("os");
const path = require("path") as typeof import("path");

export class SyncthingClient {
  private apiKey: string = "";
  private baseUrl = "http://localhost:8384";

  // ── Helpers ──────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return { "X-API-Key": this.apiKey };
  }

  private async apiGet(endpoint: string): Promise<any> {
    const res = await requestUrl({
      url: `${this.baseUrl}${endpoint}`,
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    return res.json;
  }

  private async apiPut(endpoint: string, body: any): Promise<void> {
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
    } catch {
      return false;
    }
  }

  /**
   * Read API key from Syncthing config.xml on disk.
   * Platform-aware paths: macOS, Linux, Windows.
   */
  async loadApiKey(): Promise<boolean> {
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
        } catch {
          // Try next candidate
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /** Get this device's Syncthing Device ID. */
  async getDeviceId(): Promise<string | null> {
    try {
      const status = await this.apiGet("/rest/system/status");
      return status?.myID ?? null;
    } catch {
      return null;
    }
  }

  /** Add a remote device. No-op if already exists. */
  async addDevice(deviceId: string, name: string): Promise<boolean> {
    try {
      if (await this.hasDevice(deviceId)) return true;

      const config = await this.apiGet("/rest/config");
      config.devices = config.devices ?? [];
      config.devices.push({
        deviceID: deviceId,
        name,
        addresses: ["dynamic"],
        compression: "metadata",
        introducer: false,
        paused: false,
      });

      await this.apiPut("/rest/config", config);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if a device is already configured. */
  async hasDevice(deviceId: string): Promise<boolean> {
    try {
      const config = await this.apiGet("/rest/config");
      const devices: any[] = config?.devices ?? [];
      return devices.some(
        (d: any) => d.deviceID?.toUpperCase() === deviceId.toUpperCase(),
      );
    } catch {
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
      const folders: any[] = config.folders ?? [];

      const requiredDevices = [
        { deviceID: localId, introducedBy: "" },
        { deviceID: deviceId, introducedBy: "" },
      ];

      const existing = folders.find((f: any) => f.id === folderId);

      if (existing) {
        const existingIds = new Set(
          (existing.devices ?? []).map((d: any) => d.deviceID?.toUpperCase()),
        );
        for (const rd of requiredDevices) {
          if (!existingIds.has(rd.deviceID.toUpperCase())) {
            existing.devices.push(rd);
          }
        }
        existing.path = folderPath;
      } else {
        config.folders = folders;
        config.folders.push({
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
    } catch {
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
        state: status?.state ?? "unknown",
        needFiles: status?.needFiles ?? 0,
        globalFiles: status?.globalFiles ?? 0,
      };
    } catch {
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