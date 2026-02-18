import { App, TFile, TFolder } from "obsidian";

const PROFILE_PATH = "system/profile.md";
const INDEX_PATH = "system/index.md";

const DEFAULT_PROFILE = `# Profile

> Life Companition AI sẽ giúp bạn điền profile này qua các cuộc trò chuyện.

## Về bạn
- Tên:
- Tuổi:
- Nghề nghiệp:
- Nơi ở:

## Gia đình gần
(Bố, mẹ, anh chị em — cập nhật khi user chia sẻ)

## Mục tiêu hiện tại
-

## Sở thích
-
`;

const DEFAULT_INDEX = `# Vault Index

> AI reads this file to route notes correctly. Update when vault structure changes.

## Routing Rules (MUST FOLLOW)

### 1. Events & Calendar
- Sự kiện có ngày/giờ → dùng tool \`create_event\` (KHÔNG dùng write_note)
- Events lưu trong \`calendar/\` — Full Calendar plugin đọc từ đây
- Việc trong ngày không có giờ cụ thể → daily note via \`create_daily_note\`

### 2. People
- Gia đình gần (bố, mẹ, anh chị em ruột): update \`system/profile.md\` VÀ \`people/family/\`
- Họ hàng, bạn bè, contacts: tạo/update note trong \`people/\`
- Mỗi người 1 note: \`people/family/{slug}.md\` hoặc \`people/friends/{slug}.md\`
- Note tổng quan gia đình: \`people/family/overview.md\`
- Luôn \`search_vault\` trước khi tạo note mới về người — tránh trùng

### 3. Projects (có mục tiêu + deadline)
- Dự án mới: \`projects/{slug}.md\`
- Update dự án: \`append_note\` vào file đã có
- Dự án hoàn thành: \`move_note\` sang \`archive/projects/\`

### 4. Areas (lĩnh vực duy trì liên tục)
- Sức khỏe: \`areas/health/{slug}.md\`
- Tài chính: \`areas/finance/{slug}.md\`
- Sự nghiệp: \`areas/career/{slug}.md\`
- Học tập: \`areas/learning/{slug}.md\`
- Thói quen: \`areas/habits/{slug}.md\`

### 5. Resources (tài liệu tham khảo)
- Sách: \`resources/books/{slug}.md\`
- Bài viết: \`resources/articles/{slug}.md\`
- Tools/phần mềm: \`resources/tools/{slug}.md\`

### 6. Không rõ category
- Hỏi user 1 lần: "Lưu vào X hay Y?"
- Nếu vẫn không rõ: \`inbox/{slug}.md\`, phân loại sau

## Folders

| Folder | Mục đích | Ví dụ |
|--------|----------|-------|
| \`projects/\` | Dự án đang thực hiện | \`projects/life-companion.md\` |
| \`areas/\` | Lĩnh vực cuộc sống (health, finance, career, learning, habits) | \`areas/career/goals.md\` |
| \`resources/\` | Tài liệu (books, articles, tools) | \`resources/books/atomic-habits.md\` |
| \`people/\` | Notes về người (family, friends, contacts) | \`people/family/ha-trang.md\` |
| \`calendar/\` | Event files cho Full Calendar | \`calendar/2026-02-16 Ve Vinh.md\` |
| \`daily/\` | Daily notes | \`daily/2026-02-15.md\` |
| \`inbox/\` | Quick capture | \`inbox/random-thought.md\` |
| \`system/\` | Profile, index, chat history, retro | \`system/profile.md\` |
| \`archive/\` | Dự án xong, notes cũ | \`archive/projects/old-project.md\` |

## Naming Convention
- Tên file: lowercase, hyphenated, không dấu: \`ha-trang.md\` không phải \`Hà Trang.md\`
- Dùng [[wiki links]] để liên kết chéo
- Frontmatter cho metadata (tags, status, date)

## Scaling Rules
- Khi subfolder có >20 notes → suggest tạo sub-subfolder
- Khi domain mới xuất hiện 3+ lần → suggest tạo folder mới
- Luôn search_vault trước khi write — tránh trùng lặp
`;

export class ProfileManager {
  constructor(private app: App) {}

  async ensureLifeFolder(): Promise<void> {
    // Create PARA folder structure
    const folders = [
      "system", "system/retro", "system/chats",
      "inbox", "projects", "archive",
      "areas", "areas/health", "areas/finance", "areas/career", "areas/learning", "areas/habits",
      "resources", "resources/books",
      "people", "people/family", "people/friends", "people/contacts",
      "calendar", "daily",
    ];
    for (const f of folders) {
      if (!this.app.vault.getAbstractFileByPath(f)) {
        await this.app.vault.createFolder(f);
      }
    }

    // Ensure default memory and goals files
    if (!this.app.vault.getAbstractFileByPath("system/memories.md")) {
      await this.app.vault.create(
        "system/memories.md",
        "# Memories\n\n> Auto-managed by Life Companition AI. Each entry is a saved memory.\n"
      );
    }
    if (!this.app.vault.getAbstractFileByPath("system/goals.md")) {
      await this.app.vault.create(
        "system/goals.md",
        "# Goals\n\n> Track your life goals here. Managed by Life Companition AI.\n"
      );
    }

    // Auto-migrate from old structure
    await this.migrateOldStructure();
  }

  private async migrateOldStructure(): Promise<void> {
    // Migrate _life/ → system/ (profile, index, retro)
    await this.migrateFolder("_life/retro", "system/retro");
    await this.migrateFile("_life/profile.md", PROFILE_PATH);
    await this.migrateFile("_life/index.md", INDEX_PATH);
    await this.deleteEmptyFolder("_life");

    // Migrate _inbox/ → inbox/
    await this.migrateFolder("_inbox", "inbox");

    // Migrate _chats/ → system/chats/
    await this.migrateFolder("_chats", "system/chats");

    // Migrate relationships/ → people/family/ (most relationship notes are family)
    await this.migrateFolder("relationships", "people/family");

    // Migrate personal/ → areas/ (distribute later)
    // But redirect subfolders that match root PARA folders (e.g. personal/calendar → calendar/)
    await this.migrateFolder("personal", "areas", ["calendar", "projects", "daily", "inbox"]);

    // Migrate career/ → areas/career/
    await this.migrateFolder("career", "areas/career");

    // Migrate books/ → resources/books/
    await this.migrateFolder("books", "resources/books");

    // Migrate ideas/ → inbox/ (to be re-categorized)
    await this.migrateFolder("ideas", "inbox");

    // Migrate "Daily Notes/" → daily/
    await this.migrateFolder("Daily Notes", "daily");
  }

  private async migrateFile(from: string, to: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!file || !(file instanceof TFile)) return;
    const existing = this.app.vault.getAbstractFileByPath(to);
    if (existing) return; // Don't overwrite existing files
    try {
      await this.app.vault.rename(file, to);
    } catch {
      // Silently skip if rename fails
    }
  }

  private async migrateFolder(from: string, to: string, redirectToRoot?: string[]): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(from);
    if (!folder || !(folder instanceof TFolder)) return;

    // Move all files from old folder to new folder
    for (const child of [...folder.children]) {
      if (child instanceof TFile) {
        const newPath = `${to}/${child.name}`;
        const existing = this.app.vault.getAbstractFileByPath(newPath);
        if (existing) continue; // Don't overwrite
        try {
          await this.app.vault.rename(child, newPath);
        } catch {
          // Silently skip
        }
      } else if (child instanceof TFolder) {
        // Redirect matching subfolders to root-level PARA folders
        const redirectTarget = redirectToRoot?.includes(child.name) ? child.name : `${to}/${child.name}`;
        if (!this.app.vault.getAbstractFileByPath(redirectTarget)) {
          try {
            await this.app.vault.createFolder(redirectTarget);
          } catch {
            // Folder may already exist
          }
        }
        await this.migrateFolder(child.path, redirectTarget);
      }
    }

    await this.deleteEmptyFolder(from);
  }

  private async deleteEmptyFolder(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder || !(folder instanceof TFolder)) return;
    if (folder.children.length === 0) {
      try {
        await this.app.vault.delete(folder);
      } catch {
        // Silently skip
      }
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
