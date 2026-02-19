import { readFile, writeFile } from "fs/promises";
import type { AuthConfig } from "@life-companion/core";

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType: string;
    rateLimitTier?: string;
  };
}

/**
 * Manages Claude OAuth token auto-refresh for server deployment.
 * Reads credentials from Claude Code's .credentials.json file,
 * refreshes tokens before expiry using Anthropic's OAuth endpoint.
 */
export class TokenManager {
  private accessToken: string = "";
  private refreshToken: string = "";
  private expiresAt: number = 0;
  private credentialsPath: string;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onTokenRefreshed?: (token: string) => void;

  constructor(credentialsPath: string) {
    this.credentialsPath = credentialsPath;
  }

  /** Load tokens from credentials file. Returns access token or null if not found. */
  async load(): Promise<string | null> {
    try {
      const raw = await readFile(this.credentialsPath, "utf8");
      const data: ClaudeCredentials = JSON.parse(raw);

      if (!data.claudeAiOauth?.accessToken) {
        console.warn("No OAuth tokens found in credentials file.");
        return null;
      }

      this.accessToken = data.claudeAiOauth.accessToken;
      this.refreshToken = data.claudeAiOauth.refreshToken;
      this.expiresAt = data.claudeAiOauth.expiresAt;

      const expiresIn = Math.max(0, this.expiresAt - Date.now());
      console.debug(`OAuth token loaded, expires in ${Math.floor(expiresIn / 60000)} minutes`);

      this.scheduleRefresh();
      return this.accessToken;
    } catch (error) {
      console.warn(`Could not read credentials file: ${(error as Error).message}`);
      return null;
    }
  }

  /** Register callback when token is refreshed (to update AIClient) */
  onRefresh(callback: (token: string) => void) {
    this.onTokenRefreshed = callback;
  }

  /** Get current access token, refreshing if needed */
  async getToken(): Promise<string> {
    // Refresh if token expires within 5 minutes
    if (this.refreshToken && Date.now() > this.expiresAt - 5 * 60 * 1000) {
      await this.refresh();
    }
    return this.accessToken;
  }

  /** Schedule automatic refresh 10 minutes before expiry */
  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);

    const refreshIn = Math.max(0, this.expiresAt - Date.now() - 10 * 60 * 1000);
    if (refreshIn <= 0 && this.refreshToken) {
      // Already expired or about to, refresh now
      this.refresh().catch((e) => console.error("Token refresh failed:", e));
      return;
    }

    if (this.refreshToken && refreshIn > 0) {
      console.debug(`Token refresh scheduled in ${Math.floor(refreshIn / 60000)} minutes`);
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch((e) => console.error("Scheduled token refresh failed:", e));
      }, refreshIn);
    }
  }

  /** Refresh the access token using the refresh token */
  private async refresh(): Promise<void> {
    if (!this.refreshToken) {
      console.error("No refresh token available");
      return;
    }

    console.debug("Refreshing OAuth token...");

    try {
      const res = await fetch("https://console.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
        }).toString(),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OAuth refresh failed (${res.status}): ${text}`);
      }

      const data = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      this.accessToken = data.access_token;
      if (data.refresh_token) this.refreshToken = data.refresh_token;
      this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

      // Save updated tokens back to credentials file
      await this.saveCredentials();

      console.debug(`Token refreshed, expires in ${Math.floor((this.expiresAt - Date.now()) / 60000)} minutes`);

      // Notify listener (AIClient)
      if (this.onTokenRefreshed) {
        this.onTokenRefreshed(this.accessToken);
      }

      // Schedule next refresh
      this.scheduleRefresh();
    } catch (error) {
      console.error("Token refresh error:", (error as Error).message);

      // Fallback: try re-reading credentials file (Claude Code might have refreshed it)
      console.debug("Trying to re-read credentials file...");
      const token = await this.load();
      if (token && this.expiresAt > Date.now()) {
        console.debug("Got fresh token from credentials file");
        if (this.onTokenRefreshed) {
          this.onTokenRefreshed(this.accessToken);
        }
      }
    }
  }

  /** Write updated tokens back to the credentials file */
  private async saveCredentials(): Promise<void> {
    try {
      const raw = await readFile(this.credentialsPath, "utf8");
      const data: ClaudeCredentials = JSON.parse(raw);

      if (data.claudeAiOauth) {
        data.claudeAiOauth.accessToken = this.accessToken;
        data.claudeAiOauth.refreshToken = this.refreshToken;
        data.claudeAiOauth.expiresAt = this.expiresAt;
      }

      await writeFile(this.credentialsPath, JSON.stringify(data), "utf8");
    } catch (error) {
      console.warn("Could not save updated credentials:", (error as Error).message);
    }
  }

  stop() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

/** Build AuthConfig from server config + optional TokenManager */
export function buildAuthConfig(
  config: {
    claudeAccessToken?: string;
    claudeApiKey?: string;
    openaiApiKey?: string;
    geminiApiKey?: string;
    groqApiKey?: string;
  },
  oauthToken?: string,
): AuthConfig {
  return {
    claudeAccessToken: oauthToken || config.claudeAccessToken,
    claudeApiKey: config.claudeApiKey,
    openaiApiKey: config.openaiApiKey,
    geminiApiKey: config.geminiApiKey,
    groqApiKey: config.groqApiKey,
  };
}
