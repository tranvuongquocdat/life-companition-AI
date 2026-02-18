import { App, TFile, TFolder, TAbstractFile, Vault, requestUrl } from "obsidian";

interface MemoryVectorEntry {
  id: string;       // "YYYY-MM-DD HH:MM" matching markdown heading
  content: string;
  type: string;
  vector: number[] | null;
}

interface MemoryVectorStore {
  version: 1;
  model: string;   // e.g. "openai:1536" or "gemini:768" — invalidate if changed
  entries: MemoryVectorEntry[];
}

interface EmbeddingKeys {
  openai?: string;
  gemini?: string;
}

export class VaultTools {
  private embeddingKeys: EmbeddingKeys = {};
  private vectorCache: MemoryVectorStore | null = null;
  private readonly VECTORS_PATH = "system/memory-vectors.json";
  private readonly SNAPSHOTS_DIR = "system/snapshots";
  private snapshotsEnabled = true;
  private maxSnapshotsPerFile = 3;
  private braveSearchApiKey = "";

  constructor(private app: App) {}

  setEmbeddingKeys(keys: EmbeddingKeys) {
    this.embeddingKeys = {
      openai: keys.openai || undefined,
      gemini: keys.gemini || undefined,
    };
  }

  setSnapshotConfig(enabled: boolean, maxPerFile: number) {
    this.snapshotsEnabled = enabled;
    this.maxSnapshotsPerFile = maxPerFile;
  }

  setBraveSearchApiKey(key: string) {
    this.braveSearchApiKey = key;
  }

  // ─── Snapshot Backup ─────────────────────────────────────────

  private async saveSnapshot(path: string, content: string): Promise<void> {
    const encoded = path.replace(/\//g, "--");
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "");
    const snapshotPath = `${this.SNAPSHOTS_DIR}/${encoded}/${timestamp}.md`;

    const folderPath = snapshotPath.substring(0, snapshotPath.lastIndexOf("/"));
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    await this.app.vault.create(snapshotPath, content);

    // Enforce retention: keep only maxSnapshotsPerFile
    const snapshotFolder = this.app.vault.getAbstractFileByPath(folderPath);
    if (snapshotFolder && snapshotFolder instanceof TFolder) {
      const files = snapshotFolder.children
        .filter((f): f is TFile => f instanceof TFile)
        .sort((a, b) => a.stat.ctime - b.stat.ctime);

      while (files.length > this.maxSnapshotsPerFile) {
        const oldest = files.shift()!;
        await this.app.vault.delete(oldest);
      }
    }
  }

  async getSnapshots(path: string): Promise<string> {
    const encoded = path.replace(/\//g, "--");
    const folderPath = `${this.SNAPSHOTS_DIR}/${encoded}`;
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!folder || !(folder instanceof TFolder)) {
      return `No snapshots found for: ${path}`;
    }

    const files = folder.children
      .filter((f): f is TFile => f instanceof TFile)
      .sort((a, b) => b.stat.ctime - a.stat.ctime);

    if (files.length === 0) return `No snapshots found for: ${path}`;

    const list = files.map((f, i) => {
      const date = f.basename.replace(/-(\d{2})-(\d{2})-(\d{2})$/, " $1:$2:$3");
      const size = f.stat.size;
      return `${i + 1}. ${date} (${size} bytes) — ${f.path}`;
    });

    return `Snapshots for ${path}:\n${list.join("\n")}`;
  }

  async readSnapshot(snapshotPath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(snapshotPath);
    if (!file || !(file instanceof TFile)) {
      return `Snapshot not found: ${snapshotPath}`;
    }
    return await this.app.vault.read(file);
  }

  private getEmbeddingProvider(): "openai" | "gemini" | null {
    if (this.embeddingKeys.openai) return "openai";
    if (this.embeddingKeys.gemini) return "gemini";
    return null;
  }

  private getEmbeddingModelId(): string | null {
    const p = this.getEmbeddingProvider();
    if (p === "openai") return "openai:1536";
    if (p === "gemini") return "gemini:768";
    return null;
  }

  // ─── Vector Store I/O ─────────────────────────────────────────

  private async loadVectorStore(): Promise<MemoryVectorStore> {
    if (this.vectorCache) return this.vectorCache;
    const modelId = this.getEmbeddingModelId() || "none";
    const file = this.app.vault.getAbstractFileByPath(this.VECTORS_PATH);
    if (file && file instanceof TFile) {
      try {
        const raw = await this.app.vault.read(file);
        const parsed = JSON.parse(raw);
        if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
          // If embedding provider changed, invalidate all vectors
          if (parsed.model && parsed.model !== modelId) {
            for (const entry of parsed.entries) entry.vector = null;
            parsed.model = modelId;
          }
          if (!parsed.model) parsed.model = modelId;
          this.vectorCache = parsed;
          return this.vectorCache!;
        }
      } catch { /* corrupted — start fresh */ }
    }
    this.vectorCache = { version: 1, model: modelId, entries: [] };
    return this.vectorCache;
  }

  private async saveVectorStore(): Promise<void> {
    if (!this.vectorCache) return;
    const json = JSON.stringify(this.vectorCache);
    const file = this.app.vault.getAbstractFileByPath(this.VECTORS_PATH);
    if (file && file instanceof TFile) {
      await this.app.vault.modify(file, json);
    } else {
      await this.app.vault.create(this.VECTORS_PATH, json);
    }
  }

  // ─── Embedding API (OpenAI → Gemini fallback) ─────────────────

  private async getEmbedding(text: string): Promise<number[] | null> {
    const provider = this.getEmbeddingProvider();
    if (!provider) return null;
    return provider === "openai"
      ? this.getOpenAIEmbedding(text)
      : this.getGeminiEmbedding(text);
  }

  private async getEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    const provider = this.getEmbeddingProvider();
    if (!provider || texts.length === 0) return texts.map(() => null);
    return provider === "openai"
      ? this.getOpenAIEmbeddings(texts)
      : this.getGeminiEmbeddings(texts);
  }

  // ── OpenAI ──

  private async getOpenAIEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await requestUrl({
        url: "https://api.openai.com/v1/embeddings",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.embeddingKeys.openai}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-large",
          input: text,
          dimensions: 1536,
        }),
        throw: false,
      });
      if (response.status !== 200) return null;
      return response.json?.data?.[0]?.embedding || null;
    } catch { return null; }
  }

  private async getOpenAIEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    try {
      const response = await requestUrl({
        url: "https://api.openai.com/v1/embeddings",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.embeddingKeys.openai}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-large",
          input: texts,
          dimensions: 1536,
        }),
        throw: false,
      });
      if (response.status !== 200) return texts.map(() => null);
      const results: (number[] | null)[] = new Array(texts.length).fill(null);
      for (const item of response.json?.data || []) {
        if (item.index < texts.length) results[item.index] = item.embedding;
      }
      return results;
    } catch { return texts.map(() => null); }
  }

  // ── Gemini ──

  private async getGeminiEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.embeddingKeys.gemini}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        }),
        throw: false,
      });
      if (response.status !== 200) return null;
      return response.json?.embedding?.values || null;
    } catch { return null; }
  }

  private async getGeminiEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    // Gemini batchEmbedContents supports up to 100 per request
    const results: (number[] | null)[] = new Array(texts.length).fill(null);
    try {
      for (let i = 0; i < texts.length; i += 100) {
        const batch = texts.slice(i, i + 100);
        const requests = batch.map((text) => ({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        }));
        const response = await requestUrl({
          url: `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${this.embeddingKeys.gemini}`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
          throw: false,
        });
        if (response.status !== 200) continue;
        const embeddings = response.json?.embeddings || [];
        for (let j = 0; j < embeddings.length; j++) {
          if (embeddings[j]?.values) results[i + j] = embeddings[j].values;
        }
      }
      return results;
    } catch { return results; }
  }

  // ─── BM25 + Vietnamese Normalization ──────────────────────────

  private normalizeVi(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  private tokenize(text: string): string[] {
    return this.normalizeVi(text).split(/[\s\p{P}]+/u).filter((t) => t.length > 0);
  }

  private scoreBM25(query: string, docs: { id: string; text: string }[]): Map<string, number> {
    const k1 = 1.5, b = 0.75;
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return new Map();

    const docTokens = docs.map((d) => this.tokenize(d.text));
    const N = docs.length;
    const avgDl = docTokens.reduce((s, t) => s + t.length, 0) / (N || 1);

    const df = new Map<string, number>();
    for (const qt of new Set(qTokens)) {
      df.set(qt, docTokens.filter((dt) => dt.includes(qt)).length);
    }

    const scores = new Map<string, number>();
    for (let i = 0; i < docs.length; i++) {
      const tf = new Map<string, number>();
      for (const t of docTokens[i]) tf.set(t, (tf.get(t) || 0) + 1);

      let score = 0;
      for (const qt of qTokens) {
        const freq = tf.get(qt) || 0;
        if (freq === 0) continue;
        const idf = Math.log((N - (df.get(qt) || 0) + 0.5) / ((df.get(qt) || 0) + 0.5) + 1);
        score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * docTokens[i].length / avgDl));
      }
      scores.set(docs[i].id, score);
    }
    return scores;
  }

  // ─── Cosine Similarity + Score Normalization ──────────────────

  private cosineSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }

  private normScores(scores: Map<string, number>): Map<string, number> {
    const vals = [...scores.values()];
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min;
    const result = new Map<string, number>();
    for (const [id, s] of scores) {
      result.set(id, range === 0 ? (s > 0 ? 1 : 0) : (s - min) / range);
    }
    return result;
  }

  // ─── Vault Tools ──────────────────────────────────────────────

  async searchVault(query: string): Promise<string> {
    const files = this.app.vault.getMarkdownFiles();
    const queryLower = query.toLowerCase();
    const queryNorm = this.normalizeVi(query);

    const scored: { path: string; heading: string; score: number; matches: string[] }[] = [];

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      const matches: string[] = [];
      let score = 0;

      // Extract first heading (H1 or first # line)
      const headingLine = lines.find((l) => /^#{1,2}\s/.test(l));
      const heading = headingLine ? headingLine.replace(/^#+\s*/, "").trim() : "";

      // Filename match (highest priority) — normalize Vietnamese diacritics
      const pathNorm = this.normalizeVi(file.path);
      if (pathNorm.includes(queryNorm)) {
        score += 100;
        matches.push(`[filename match]`);
      }

      // Heading match (high priority)
      if (heading && this.normalizeVi(heading).includes(queryNorm)) {
        score += 50;
      }

      // Content matches — search both original and normalized
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(queryLower) || this.normalizeVi(line).includes(queryNorm)) {
          matches.push(`L${i + 1}: ${line.trim()}`);
          score += line.startsWith("#") ? 10 : 1; // headings worth more
        }
      }

      if (score > 0) {
        scored.push({ path: file.path, heading, score, matches: matches.slice(0, 5) });
      }
    }

    if (scored.length === 0) {
      return `No results found for "${query}".`;
    }

    // Sort by relevance score descending
    scored.sort((a, b) => b.score - a.score);

    return scored
      .slice(0, 20)
      .map((r) => {
        const title = r.heading ? ` — ${r.heading}` : "";
        return `## ${r.path}${title}\n${r.matches.join("\n")}`;
      })
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
      if (this.snapshotsEnabled) {
        const oldContent = await this.app.vault.read(existing);
        await this.saveSnapshot(path, oldContent).catch((e) =>
          console.warn("Snapshot save failed:", e)
        );
      }
      await this.app.vault.modify(existing, content);
      return this.snapshotsEnabled
        ? `Updated: ${path} (snapshot saved — use get_snapshots to view previous versions)`
        : `Updated: ${path}`;
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
    if (this.braveSearchApiKey) {
      try {
        return await this.braveSearch(query);
      } catch (e) {
        // Fallback to DuckDuckGo on Brave failure (quota exceeded, invalid key, etc.)
        console.warn("Brave Search failed, falling back to DuckDuckGo:", (e as Error).message);
      }
    }
    return this.duckDuckGoSearch(query);
  }

  private async braveSearch(query: string): Promise<string> {
    const params = new URLSearchParams({
      q: query,
      count: "8",
      text_decorations: "false",
    });

    const response = await requestUrl({
      url: `https://api.search.brave.com/res/v1/web/search?${params}`,
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.braveSearchApiKey,
      },
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`Brave API error: HTTP ${response.status}`);
    }

    const data = response.json;
    const results: string[] = [];

    if (data.web?.results) {
      for (let i = 0; i < Math.min(data.web.results.length, 8); i++) {
        const r = data.web.results[i];
        const snippet = r.description || "";
        results.push(`${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`);
      }
    }

    return results.length > 0
      ? results.join("\n\n")
      : `No results found for "${query}".`;
  }

  private async duckDuckGoSearch(query: string): Promise<string> {
    const response = await requestUrl({
      url: "https://html.duckduckgo.com/html/",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(query)}`,
    });

    const html = response.text;
    const results: string[] = [];

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

  // ─── Memory & Goals Tools ────────────────────────────────────

  private readonly MEMORIES_PATH = "system/memories.md";
  private readonly GOALS_PATH = "system/goals.md";

  async saveMemory(content: string, type?: string): Promise<string> {
    const memoryType = type || "fact";
    const validTypes = ["fact", "preference", "context", "emotional"];
    if (!validTypes.includes(memoryType)) {
      return `Invalid memory type "${memoryType}". Use: ${validTypes.join(", ")}`;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const entry = `\n## ${dateStr} ${timeStr}\nType: ${memoryType}\n${content}\n`;

    const file = this.app.vault.getAbstractFileByPath(this.MEMORIES_PATH);
    if (file && file instanceof TFile) {
      await this.app.vault.append(file, entry);
    } else {
      const header = "# Memories\n\n> Auto-managed by Life Companition AI. Each entry is a saved memory.\n";
      await this.app.vault.create(this.MEMORIES_PATH, header + entry);
    }
    // Add to vector store + embed inline
    const id = `${dateStr} ${timeStr}`;
    const store = await this.loadVectorStore();
    store.entries.push({ id, content, type: memoryType, vector: null });

    if (this.getEmbeddingProvider()) {
      const vector = await this.getEmbedding(content);
      const entry = store.entries[store.entries.length - 1];
      if (vector) entry.vector = vector;
    }

    await this.saveVectorStore();

    return `Saved memory (${memoryType}): ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`;
  }

  async recallMemory(query?: string, days?: number, limit?: number): Promise<string> {
    const maxEntries = limit || 10;
    const file = this.app.vault.getAbstractFileByPath(this.MEMORIES_PATH);
    if (!file || !(file instanceof TFile)) {
      return "No memories saved yet.";
    }

    const content = await this.app.vault.read(file);
    const entries: { date: string; type: string; content: string }[] = [];
    const blocks = content.split(/^## /m).slice(1);

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const dateLine = lines[0] || "";
      const typeLine = lines[1] || "";
      const bodyLines = lines.slice(2).join("\n").trim();
      const dateStr = dateLine.split(" ")[0];
      const memType = typeLine.replace("Type: ", "").trim();
      entries.push({ date: dateStr, type: memType, content: bodyLines });
    }

    let filtered = entries;

    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      filtered = filtered.filter((e) => e.date >= cutoffStr);
    }

    if (query) {
      // Hybrid search: BM25 + cosine similarity
      const docs = filtered.map((e, i) => ({ id: String(i), text: `${e.type} ${e.content}` }));
      const bm25 = this.normScores(this.scoreBM25(query, docs));

      let cosineScores: Map<string, number> | null = null;
      if (this.getEmbeddingProvider()) {
        try {
          const qVec = await this.getEmbedding(query);
          if (qVec) {
            const store = await this.loadVectorStore();
            const raw = new Map<string, number>();
            for (let i = 0; i < filtered.length; i++) {
              const e = filtered[i];
              const ve = store.entries.find((v) => v.content === e.content && v.type === e.type);
              raw.set(String(i), ve?.vector ? this.cosineSim(qVec, ve.vector) : 0);
            }
            cosineScores = this.normScores(raw);
          }
        } catch { /* fallback to BM25 only */ }
      }

      // Combine and sort
      const scored = filtered.map((entry, i) => {
        const id = String(i);
        const b = bm25.get(id) || 0;
        const c = cosineScores?.get(id) || 0;
        const score = cosineScores ? 0.3 * b + 0.7 * c : b;
        return { entry, score };
      }).filter((r) => r.score > 0);

      scored.sort((a, b) => b.score - a.score);
      filtered = scored.slice(0, maxEntries).map((r) => r.entry);
    } else {
      // No query — return most recent
      filtered = filtered.slice(-maxEntries).reverse();
    }

    if (filtered.length === 0) {
      return query ? `No memories found matching "${query}".` : "No memories found.";
    }

    return filtered.map((e) => `## ${e.date}\nType: ${e.type}\n${e.content}`).join("\n\n");
  }

  async gatherRetroData(startDate: string, endDate: string): Promise<string> {
    const sections: string[] = [];

    // 1. Daily notes in range
    const dailyNotes: string[] = [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const path = `daily/${dateStr}.md`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) {
        const content = await this.app.vault.cachedRead(file);
        dailyNotes.push(`### ${dateStr}\n${content.slice(0, 500)}`);
      }
      current.setDate(current.getDate() + 1);
    }
    if (dailyNotes.length > 0) {
      sections.push(`## Daily Notes\n${dailyNotes.join("\n\n")}`);
    }

    // 2. Memories in range
    const memFile = this.app.vault.getAbstractFileByPath(this.MEMORIES_PATH);
    if (memFile && memFile instanceof TFile) {
      const memContent = await this.app.vault.read(memFile);
      const memBlocks = memContent.split(/^## /m).slice(1);
      const inRange = memBlocks.filter((block) => {
        const dateStr = block.trim().split(" ")[0];
        return dateStr >= startDate && dateStr <= endDate;
      });
      if (inRange.length > 0) {
        sections.push(`## Memories\n${inRange.map((b) => `## ${b.trim()}`).join("\n\n")}`);
      }
    }

    // 3. Goals
    const goalsFile = this.app.vault.getAbstractFileByPath(this.GOALS_PATH);
    if (goalsFile && goalsFile instanceof TFile) {
      const goalsContent = await this.app.vault.cachedRead(goalsFile);
      sections.push(`## Current Goals\n${goalsContent}`);
    }

    // 4. Recently modified notes in range
    const startMs = start.getTime();
    const endMs = end.getTime() + 24 * 60 * 60 * 1000;
    const recentFiles = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.stat.mtime >= startMs && f.stat.mtime <= endMs)
      .filter((f) => !f.path.startsWith("daily/") && !f.path.startsWith("system/"))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 15);
    if (recentFiles.length > 0) {
      const noteList = recentFiles
        .map((f) => {
          const date = new Date(f.stat.mtime).toISOString().slice(0, 10);
          return `- ${date} — ${f.path}`;
        })
        .join("\n");
      sections.push(`## Modified Notes\n${noteList}`);
    }

    if (sections.length === 0) {
      return `No data found for ${startDate} to ${endDate}.`;
    }

    return `# Retro Data: ${startDate} to ${endDate}\n\n${sections.join("\n\n---\n\n")}`;
  }

  async saveRetro(period: string, content: string): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10);
    const path = `system/retro/${dateStr}-${period}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing && existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return `Updated retro: ${path}`;
    }

    const folderPath = "system/retro";
    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
    await this.app.vault.create(path, content);
    return `Created retro: ${path}`;
  }

  async getGoals(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(this.GOALS_PATH);
    if (!file || !(file instanceof TFile)) {
      return "No goals file found. Use update_goal to create your first goal.";
    }
    return await this.app.vault.read(file);
  }

  async updateGoal(
    title: string,
    updates: { status?: string; progress?: string; target?: string }
  ): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(this.GOALS_PATH);
    const dateStr = new Date().toISOString().slice(0, 10);

    if (!file || !(file instanceof TFile)) {
      const newGoal = `## \u{1F3AF} ${title}\n- Target: ${updates.target || "TBD"}\n- Status: ${updates.status || "In Progress"}\n- Progress: ${updates.progress || "(no progress notes yet)"}\n- Last updated: ${dateStr}\n`;
      const header =
        "# Goals\n\n> Track your life goals here. Managed by Life Companition AI.\n\n";
      await this.app.vault.create(this.GOALS_PATH, header + newGoal);
      return `Created goals file with goal: ${title}`;
    }

    const content = await this.app.vault.read(file);
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const goalPattern = new RegExp(`^## [^\\n]*${escaped}`, "m");
    const match = content.match(goalPattern);

    if (!match || match.index === undefined) {
      const newGoal = `\n## \u{1F3AF} ${title}\n- Target: ${updates.target || "TBD"}\n- Status: ${updates.status || "In Progress"}\n- Progress: ${updates.progress || "(no progress notes yet)"}\n- Last updated: ${dateStr}\n`;
      await this.app.vault.append(file, newGoal);
      return `Added new goal: ${title}`;
    }

    const startIdx = match.index;
    const rest = content.slice(startIdx);
    const nextHeading = rest.indexOf("\n## ", 1);
    const endIdx = nextHeading >= 0 ? startIdx + nextHeading : content.length;
    let goalBlock = content.slice(startIdx, endIdx);

    if (updates.status) {
      goalBlock = goalBlock.replace(/- Status: .+/, `- Status: ${updates.status}`);
    }
    if (updates.progress) {
      goalBlock = goalBlock.replace(/- Progress: .+/, `- Progress: ${updates.progress}`);
    }
    if (updates.target) {
      goalBlock = goalBlock.replace(/- Target: .+/, `- Target: ${updates.target}`);
    }
    goalBlock = goalBlock.replace(/- Last updated: .+/, `- Last updated: ${dateStr}`);

    const newContent = content.slice(0, startIdx) + goalBlock + content.slice(endIdx);
    await this.app.vault.modify(file, newContent);
    return `Updated goal: ${title}`;
  }

  async backfillEmbeddings(): Promise<string> {
    if (!this.getEmbeddingProvider()) return "No API key.";
    const file = this.app.vault.getAbstractFileByPath(this.MEMORIES_PATH);
    if (!file || !(file instanceof TFile)) return "No memories.";

    const content = await this.app.vault.read(file);
    const blocks = content.split(/^## /m).slice(1);
    const store = await this.loadVectorStore();

    const toEmbed: { idx: number; text: string }[] = [];
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const id = (lines[0] || "").trim();
      const memType = (lines[1] || "").replace("Type: ", "").trim();
      const body = lines.slice(2).join("\n").trim();

      let entry = store.entries.find((e) => e.id === id);
      if (!entry) {
        entry = { id, content: body, type: memType, vector: null };
        store.entries.push(entry);
      }
      if (!entry.vector) {
        toEmbed.push({ idx: store.entries.indexOf(entry), text: body });
      }
    }

    // Batch embed in groups of 50
    for (let i = 0; i < toEmbed.length; i += 50) {
      const batch = toEmbed.slice(i, i + 50);
      const vectors = await this.getEmbeddings(batch.map((b) => b.text));
      for (let j = 0; j < batch.length; j++) {
        if (vectors[j]) store.entries[batch[j].idx].vector = vectors[j];
      }
    }

    await this.saveVectorStore();
    return `Backfilled ${toEmbed.length} memories.`;
  }

  async getRecentMemories(limit: number = 10): Promise<string> {
    return this.recallMemory(undefined, undefined, limit);
  }

  async getPendingDailyTasks(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const path = `daily/${today}.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return "";

    const content = await this.app.vault.cachedRead(file);
    const pending: string[] = [];
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*-\s*\[ \]\s*(.*)/);
      if (match) pending.push(`- [ ] ${match[1].trim()}`);
    }
    return pending.join("\n");
  }

  async getPreferenceContext(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(this.MEMORIES_PATH);
    if (!file || !(file instanceof TFile)) return "";

    const content = await this.app.vault.read(file);
    const blocks = content.split(/^## /m).slice(1);
    const preferences: string[] = [];

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const typeLine = lines[1] || "";
      const memType = typeLine.replace("Type: ", "").trim();
      if (memType !== "preference") continue;
      const body = lines.slice(2).join(" ").trim();
      if (body) preferences.push(`- ${body}`);
    }

    if (preferences.length === 0) return "";
    return preferences.join("\n");
  }
}
