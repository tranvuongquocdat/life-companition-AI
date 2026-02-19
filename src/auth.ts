import { execSync } from "child_process";
import { Platform } from "obsidian";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ClaudeCodeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType: string;
  };
}

/**
 * Read Claude Code OAuth credentials from macOS Keychain.
 * Claude Code stores its tokens under "Claude Code-credentials" service name.
 * macOS will prompt the user to allow Obsidian to access this Keychain item.
 */
export function readClaudeCodeCredentials(): OAuthTokens {
  if (!Platform.isMacOS) {
    throw new Error("Hiện tại chỉ hỗ trợ macOS. Vui lòng dùng API key.");
  }

  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: "utf-8", timeout: 10000 }
    ).trim();

    const data: ClaudeCodeCredentials = JSON.parse(raw);

    if (!data.claudeAiOauth) {
      throw new Error("Không tìm thấy OAuth tokens trong Claude Code credentials.");
    }

    const oauth = data.claudeAiOauth;
    if (!oauth.accessToken || !oauth.refreshToken) {
      throw new Error("Claude Code chưa đăng nhập. Hãy chạy 'claude' trong Terminal trước.");
    }

    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
    };
  } catch (error) {
    if ((error as Error).message?.includes("could not be found")) {
      throw new Error(
        "Không tìm thấy Claude Code credentials. Hãy cài và đăng nhập Claude Code trước."
      );
    }
    if ((error as Error).message?.includes("JSON")) {
      throw new Error("Credentials format không hợp lệ.");
    }
    throw error;
  }
}

/**
 * Re-read fresh tokens from Claude Code Keychain.
 * Claude Code handles token refresh automatically,
 * so we just read the latest tokens when ours expire.
 */
export function refreshFromClaudeCode(): OAuthTokens {
  return readClaudeCodeCredentials();
}
