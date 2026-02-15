import { App, TFile, TFolder, TAbstractFile, Vault, requestUrl } from "obsidian";

export class VaultTools {
  constructor(private app: App) {}

  async searchVault(query: string): Promise<string> {
    const files = this.app.vault.getMarkdownFiles();
    const results: { path: string; matches: string[] }[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      const matches: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          matches.push(`L${i + 1}: ${lines[i].trim()}`);
        }
      }

      if (file.path.toLowerCase().includes(queryLower)) {
        matches.unshift(`[filename match]`);
      }

      if (matches.length > 0) {
        results.push({ path: file.path, matches: matches.slice(0, 5) });
      }
    }

    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    return results
      .slice(0, 20)
      .map((r) => `## ${r.path}\n${r.matches.join("\n")}`)
      .join("\n\n");
  }

  async readNote(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      return `File not found: ${path}`;
    }
    const content = await this.app.vault.read(file);
    return content;
  }

  async writeNote(path: string, content: string): Promise<string> {
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing && existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return `Updated: ${path}`;
    }

    const folderPath = path.substring(0, path.lastIndexOf("/"));
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    await this.app.vault.create(path, content);
    return `Created: ${path}`;
  }

  async moveNote(from: string, to: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!file) {
      return `File not found: ${from}`;
    }

    const folderPath = to.substring(0, to.lastIndexOf("/"));
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    await this.app.vault.rename(file, to);
    return `Moved: ${from} → ${to}`;
  }

  async listFolder(path: string): Promise<string> {
    const targetPath = path || "/";
    const folder = targetPath === "/"
      ? this.app.vault.getRoot()
      : this.app.vault.getAbstractFileByPath(targetPath);

    if (!folder || !(folder instanceof TFolder)) {
      return `Folder not found: ${path}`;
    }

    const items: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        items.push(`📁 ${child.name}/`);
      } else if (child instanceof TFile) {
        items.push(`📄 ${child.name}`);
      }
    }

    return items.length > 0 ? items.join("\n") : "(empty folder)";
  }

  async getRecentNotes(days: number): Promise<string> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const files = this.app.vault.getMarkdownFiles();

    const recent = files
      .filter((f) => f.stat.mtime > cutoff)
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 30);

    if (recent.length === 0) {
      return `No notes modified in the last ${days} days.`;
    }

    return recent
      .map((f) => {
        const date = new Date(f.stat.mtime).toISOString().split("T")[0];
        return `${date} — ${f.path}`;
      })
      .join("\n");
  }

  // ─── Knowledge Tools ─────────────────────────────────────────

  async appendNote(path: string, content: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `File not found: ${path}. Use write_note to create it first, or search_vault to find the correct path.`;
    await this.app.vault.append(file, "\n" + content);
    return `Appended to: ${path}`;
  }

  async readProperties(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `File not found: ${path}`;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return "No frontmatter properties found.";
    const props = Object.fromEntries(
      Object.entries(fm).filter(([k]) => k !== "position")
    );
    return JSON.stringify(props, null, 2);
  }

  async updateProperties(path: string, properties: Record<string, unknown>): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `File not found: ${path}`;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [key, value] of Object.entries(properties)) {
        fm[key] = value;
      }
    });
    return `Updated properties on: ${path}`;
  }

  async getTags(): Promise<string> {
    const tagCounts: Record<string, number> = {};
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = cache?.tags?.map((t) => t.tag) || [];
      const fmTags = (cache?.frontmatter?.tags || []) as string[];
      for (const tag of [...tags, ...fmTags.map((t) => t.startsWith("#") ? t : "#" + t)]) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    if (Object.keys(tagCounts).length === 0) return "No tags found in vault.";
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `${tag} (${count})`)
      .join("\n");
  }

  async searchByTag(tag: string): Promise<string> {
    const normalized = tag.startsWith("#") ? tag : "#" + tag;
    const results: string[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = cache?.tags?.map((t) => t.tag) || [];
      const fmTags = ((cache?.frontmatter?.tags || []) as string[])
        .map((t) => t.startsWith("#") ? t : "#" + t);
      if ([...tags, ...fmTags].includes(normalized)) {
        results.push(file.path);
      }
    }
    return results.length > 0 ? results.join("\n") : `No notes found with tag ${normalized}`;
  }

  async getVaultStats(): Promise<string> {
    const files = this.app.vault.getMarkdownFiles();
    const folders = new Set<string>();
    const tagSet = new Set<string>();
    let totalSize = 0;
    const now = Date.now();
    let recentCount = 0;

    for (const file of files) {
      totalSize += file.stat.size;
      if (now - file.stat.mtime < 7 * 24 * 60 * 60 * 1000) recentCount++;
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join("/"));
      }
      const cache = this.app.metadataCache.getFileCache(file);
      cache?.tags?.forEach((t) => tagSet.add(t.tag));
    }

    return [
      `Notes: ${files.length}`,
      `Folders: ${folders.size}`,
      `Tags: ${tagSet.size}`,
      `Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`,
      `Modified this week: ${recentCount}`,
    ].join("\n");
  }

  // ─── Graph Tools ────────────────────────────────────────────────

  async getBacklinks(path: string): Promise<string> {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const backlinks: string[] = [];
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      if (path in targets) {
        backlinks.push(sourcePath);
      }
    }
    return backlinks.length > 0
      ? `${backlinks.length} backlinks:\n${backlinks.join("\n")}`
      : `No backlinks found for ${path}`;
  }

  async getOutgoingLinks(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `File not found: ${path}`;
    const cache = this.app.metadataCache.getFileCache(file);
    const links = cache?.links || [];
    if (links.length === 0) return "No outgoing links found.";
    return links.map((l) => {
      const target = this.app.metadataCache.getFirstLinkpathDest(l.link, path);
      const exists = target ? "exists" : "missing";
      return `[[${l.link}]] (${exists})`;
    }).join("\n");
  }

  // ─── Task Tools ─────────────────────────────────────────────────

  async getTasks(path: string, includeCompleted = true): Promise<string> {
    const files: TFile[] = [];
    if (!path) {
      files.push(...this.app.vault.getMarkdownFiles());
    } else {
      const target = this.app.vault.getAbstractFileByPath(path);
      if (target instanceof TFile) {
        files.push(target);
      } else if (target instanceof TFolder) {
        for (const child of this.app.vault.getMarkdownFiles()) {
          if (child.path.startsWith(path)) files.push(child);
        }
      } else {
        return `Path not found: ${path}`;
      }
    }

    const results: string[] = [];
    for (const file of files.slice(0, 50)) {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)/);
        if (match) {
          const done = match[2] !== " ";
          if (!includeCompleted && done) continue;
          const status = done ? "[x]" : "[ ]";
          results.push(`${status} ${match[3].trim()} — ${file.path}:${i + 1}`);
        }
      }
    }

    return results.length > 0
      ? results.slice(0, 100).join("\n")
      : "No tasks found.";
  }

  async toggleTask(path: string, line: number): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `File not found: ${path}`;
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) return `Line ${line} out of range.`;
    const taskMatch = lines[idx].match(/^(\s*-\s*\[)([ xX])(\]\s*.*)/);
    if (!taskMatch) return `Line ${line} is not a task.`;
    const newStatus = taskMatch[2] === " " ? "x" : " ";
    lines[idx] = taskMatch[1] + newStatus + taskMatch[3];
    await this.app.vault.modify(file, lines.join("\n"));
    return `Toggled task at line ${line}: ${newStatus === "x" ? "done" : "undone"}`;
  }

  // ─── Daily Tools ────────────────────────────────────────────────

  private getDailyNotePath(dateStr?: string): string {
    const date = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `daily/${yyyy}-${mm}-${dd}.md`;
  }

  async getDailyNote(date?: string): Promise<string> {
    const path = this.getDailyNotePath(date);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return `Daily note not found: ${path}`;
    return await this.app.vault.read(file);
  }

  async createDailyNote(date?: string, content?: string): Promise<string> {
    const path = this.getDailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) return `Daily note already exists: ${path}. Use read or append instead.`;

    const dateObj = date ? new Date(date + "T00:00:00") : new Date();
    const heading = dateObj.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const body = content || `# ${heading}\n\n`;

    const folderPath = path.substring(0, path.lastIndexOf("/"));
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) await this.app.vault.createFolder(folderPath);

    await this.app.vault.create(path, body);
    return `Created daily note: ${path}`;
  }

  // ─── Web Tools ────────────────────────────────────────────────

  async webSearch(query: string): Promise<string> {
    const response = await requestUrl({
      url: "https://html.duckduckgo.com/html/",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(query)}`,
    });

    const html = response.text;
    const results: string[] = [];

    // Extract result links
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links: { url: string; title: string }[] = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      links.push({
        url: m[1],
        title: m[2].replace(/<[^>]+>/g, "").trim(),
      });
    }

    const snippets: string[] = [];
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
    }

    for (let i = 0; i < Math.min(links.length, 8); i++) {
      const link = links[i];
      const snippet = snippets[i] || "";
      results.push(`${i + 1}. **${link.title}**\n   ${link.url}\n   ${snippet}`);
    }

    return results.length > 0
      ? results.join("\n\n")
      : `No results found for "${query}".`;
  }

  async webFetch(url: string): Promise<string> {
    const response = await requestUrl({ url, throw: false });

    if (response.status !== 200) {
      return `Failed to fetch ${url}: HTTP ${response.status}`;
    }

    const contentType = response.headers["content-type"] || "";
    let text = response.text;

    if (contentType.includes("text/html")) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }

    if (text.length > 15000) {
      text = text.slice(0, 15000) + "\n\n[... truncated]";
    }

    return text || "No content found at this URL.";
  }
}
