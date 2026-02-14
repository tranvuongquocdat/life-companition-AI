import { App, TFile, TFolder } from "obsidian";

const PROFILE_PATH = "_life/profile.md";
const INDEX_PATH = "_life/index.md";

const DEFAULT_PROFILE = `# Profile

(Life Companion sẽ giúp bạn điền profile này qua các cuộc trò chuyện)

## Về bạn
- Tên:
- Tuổi:
- Nghề nghiệp:

## Mục tiêu hiện tại
-

## Ưu tiên
-

## Phong cách ghi chú
-
`;

const DEFAULT_INDEX = `# Vault Index

> AI đọc file này để biết cấu trúc vault. Cập nhật khi vault thay đổi.

## Domains
- ideas/ → Ý tưởng chưa thực hiện (side-projects, freelance, company)
- projects/ → Đang thực hiện / đã thực hiện
- career/ → Skills, goals, opportunities
- relationships/ → Gia đình, bạn bè, đối tác
- personal/ → Health, finance, habits
- books/ → Đang đọc, đã đọc, muốn đọc

## Special Folders
- _inbox/ → Quick capture, AI phân loại sau
- _chats/ → Lịch sử chat AI
- _life/ → Profile, index, reminders, retro
- _life/retro/ → Weekly / monthly / quarterly retro notes

## Rules
- Quick capture → _inbox/, AI phân loại sau
- Mọi note dùng [[wiki links]] để liên kết chéo
- Khi domain mới xuất hiện nhiều lần → AI đề xuất tạo folder mới
`;

export class ProfileManager {
  constructor(private app: App) {}

  async ensureLifeFolder(): Promise<void> {
    const lifeFolder = this.app.vault.getAbstractFileByPath("_life");
    if (!lifeFolder) {
      await this.app.vault.createFolder("_life");
    }

    const retroFolder = this.app.vault.getAbstractFileByPath("_life/retro");
    if (!retroFolder) {
      await this.app.vault.createFolder("_life/retro");
    }

    const inboxFolder = this.app.vault.getAbstractFileByPath("_inbox");
    if (!inboxFolder) {
      await this.app.vault.createFolder("_inbox");
    }

    const chatsFolder = this.app.vault.getAbstractFileByPath("_chats");
    if (!chatsFolder) {
      await this.app.vault.createFolder("_chats");
    }
  }

  async getProfile(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(PROFILE_PATH);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    await this.ensureLifeFolder();
    await this.app.vault.create(PROFILE_PATH, DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  }

  async getIndex(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(INDEX_PATH);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    await this.ensureLifeFolder();
    await this.app.vault.create(INDEX_PATH, DEFAULT_INDEX);
    return DEFAULT_INDEX;
  }
}
