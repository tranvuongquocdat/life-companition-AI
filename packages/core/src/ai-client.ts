import type { AIModel, AIProvider, AIResponse, Attachment, ChatMode, SimpleMessage, TokenUsage } from "./types";
import type { ToolDefinition } from "./tool-definitions";

// ─── HTTP abstraction (platform-agnostic) ──────────────────────

export interface HttpRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  throw?: boolean;
}

export interface HttpResponse {
  status: number;
  text: string;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type HttpClient = (req: HttpRequestOptions) => Promise<HttpResponse>;

// ─── Send options ──────────────────────────────────────────────

export interface SendMessageOptions {
  userMessage: string;
  mode: ChatMode;
  model: AIModel;
  provider: AIProvider;
  systemPrompt: string;
  conversationHistory: SimpleMessage[];
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<string>;
  tools?: ToolDefinition[];
  attachments?: Attachment[];
  onText: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolUse: (toolName: string, input: Record<string, unknown>) => void;
  onToolResult: (toolName: string, result: string) => void;
}

export interface AuthConfig {
  claudeAccessToken?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
}

export class AIClient {
  private auth: AuthConfig;
  private http: HttpClient;

  constructor(auth: AuthConfig, httpClient: HttpClient) {
    this.auth = auth;
    this.http = httpClient;
  }

  updateAuth(auth: AuthConfig) {
    this.auth = auth;
  }

  /** Simulate streaming by emitting text word-by-word with small delays */
  private async simulateStream(text: string, onText: (chunk: string) => void): Promise<void> {
    const words = text.split(/(\s+)/); // split keeping whitespace
    const batchSize = 3;
    for (let i = 0; i < words.length; i += batchSize) {
      const chunk = words.slice(i, i + batchSize).join("");
      onText(chunk);
      await new Promise((r) => setTimeout(r, 18));
    }
  }

  async sendMessage(options: SendMessageOptions): Promise<AIResponse> {
    const provider = options.provider;
    switch (provider) {
      case "claude":
        return this.sendClaude(options);
      case "openai":
        return this.sendOpenAICompatible(
          options,
          "https://api.openai.com/v1/chat/completions",
          this.auth.openaiApiKey || ""
        );
      case "groq":
        return this.sendOpenAICompatible(
          options,
          "https://api.groq.com/openai/v1/chat/completions",
          this.auth.groqApiKey || ""
        );
      case "gemini":
        return this.sendGemini(options);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async summarize(text: string, systemPrompt: string, provider: AIProvider, model: string): Promise<AIResponse> {
    switch (provider) {
      case "claude": {
        const res = await this.http({
          url: "https://api.anthropic.com/v1/messages",
          method: "POST",
          headers: this.getClaudeHeaders(),
          body: JSON.stringify({ model, max_tokens: 2048, system: systemPrompt, messages: [{ role: "user", content: text }] }),
          throw: false,
        });
        if (res.status !== 200) throw new Error(`Summarize failed: ${res.status}`);
        const d = res.json;
        return {
          text: d.content?.map((b: any) => b.text || "").join("") || "", // eslint-disable-line @typescript-eslint/no-explicit-any
          usage: { inputTokens: d.usage?.input_tokens || 0, outputTokens: d.usage?.output_tokens || 0 },
        };
      }
      case "openai":
      case "groq": {
        const url = provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.groq.com/openai/v1/chat/completions";
        const key = provider === "openai" ? (this.auth.openaiApiKey || "") : (this.auth.groqApiKey || "");
        const res = await this.http({
          url, method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 2048, messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ]}),
          throw: false,
        });
        if (res.status !== 200) throw new Error(`Summarize failed: ${res.status}`);
        const d = res.json;
        return {
          text: d.choices?.[0]?.message?.content || "",
          usage: { inputTokens: d.usage?.prompt_tokens || 0, outputTokens: d.usage?.completion_tokens || 0 },
        };
      }
      case "gemini": {
        const res = await this.http({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.auth.geminiApiKey || ""}`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
          }),
          throw: false,
        });
        if (res.status !== 200) throw new Error(`Summarize failed: ${res.status}`);
        const d = res.json;
        return {
          text: d.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "", // eslint-disable-line @typescript-eslint/no-explicit-any
          usage: { inputTokens: d.usageMetadata?.promptTokenCount || 0, outputTokens: d.usageMetadata?.candidatesTokenCount || 0 },
        };
      }
    }
  }

  // ─── Claude (Anthropic) ───────────────────────────────────────────

  private getClaudeHeaders(mode?: ChatMode): Record<string, string> {
    const betaParts: string[] = [];
    if (this.auth.claudeAccessToken) betaParts.push("oauth-2025-04-20");
    if (mode === "dive") betaParts.push("interleaved-thinking-2025-05-14");

    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (this.auth.claudeAccessToken) {
      headers["Authorization"] = `Bearer ${this.auth.claudeAccessToken}`;
    } else {
      headers["x-api-key"] = this.auth.claudeApiKey || "";
    }
    if (betaParts.length > 0) headers["anthropic-beta"] = betaParts.join(",");
    return headers;
  }

  private async sendClaude(options: SendMessageOptions): Promise<AIResponse> {
    const { model, systemPrompt, conversationHistory, onText, onToolUse, onToolResult } = options;
    const isDive = options.mode === "dive";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const userContent = this.formatClaudeUserContent(options.userMessage, options.attachments || []);
    messages.push({ role: "user", content: userContent });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolDefs = (options.tools || []).map((t, idx, arr) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def: Record<string, any> = {
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      };
      // Cache last tool definition (prompt caching breakpoint)
      if (idx === arr.length - 1) {
        def.cache_control = { type: "ephemeral" };
      }
      return def;
    });

    let fullResponse = "";
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        model,
        max_tokens: isDive ? 16000 : 4096,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages,
      };
      if (toolDefs.length > 0) body.tools = toolDefs;

      // Extended thinking for Deep Dive mode
      if (isDive) {
        body.thinking = model.includes("opus")
          ? { type: "adaptive" }
          : { type: "enabled", budget_tokens: 10000 };
      }

      const response = await this.http({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: this.getClaudeHeaders(options.mode),
        body: JSON.stringify(body),
        throw: false,
      });

      if (response.status !== 200) {
        throw new Error(`${response.status} ${response.text}`);
      }

      const data = response.json;

      // Extract usage — use `=` for input (last iteration = full context), `+=` for output
      if (data.usage) {
        totalUsage.inputTokens = data.usage.input_tokens || 0;
        totalUsage.outputTokens += data.usage.output_tokens || 0;
        totalUsage.cacheCreationInputTokens = data.usage.cache_creation_input_tokens || 0;
        totalUsage.cacheReadInputTokens = data.usage.cache_read_input_tokens || 0;
      }

      const textParts: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolUseBlocks: any[] = [];

      for (const block of data.content) {
        if (block.type === "thinking") {
          // Extended thinking — show in UI but don't include in response text
          if (options.onThinking && block.thinking) {
            options.onThinking(block.thinking);
          }
        } else if (block.type === "text") {
          textParts.push(block.text);
          await this.simulateStream(block.text, onText);
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
          onToolUse(block.name, block.input);
        }
      }

      fullResponse += textParts.join("");
      // Preserve ALL blocks (including thinking) — required by API for tool continuations
      messages.push({ role: "assistant", content: data.content });

      if (data.stop_reason === "end_turn" || toolUseBlocks.length === 0) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await options.toolExecutor(toolUse.name, toolUse.input as Record<string, unknown>);
        onToolResult(toolUse.name, result);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { text: fullResponse, usage: totalUsage };
  }

  // ─── OpenAI-compatible (OpenAI + Groq) ─────────────────────────────

  private async sendOpenAICompatible(
    options: SendMessageOptions,
    apiUrl: string,
    apiKey: string
  ): Promise<AIResponse> {
    const { model, systemPrompt, conversationHistory, onText, onToolUse, onToolResult } = options;

    const userContent = this.formatOpenAIUserContent(options.userMessage, options.attachments || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent },
    ];

    const toolDefs = (options.tools || []).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    let fullResponse = "";
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = { model, messages };
      // OpenAI newer models all use max_completion_tokens; Groq uses max_tokens
      if (apiUrl.includes("openai.com")) {
        body.max_completion_tokens = 4096;
      } else {
        body.max_tokens = 4096;
      }
      if (toolDefs.length > 0) body.tools = toolDefs;

      const response = await this.http({
        url: apiUrl,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        throw: false,
      });

      if (response.status !== 200) {
        throw new Error(`${response.status} ${response.text}`);
      }

      const data = response.json;

      if (data.usage) {
        totalUsage.inputTokens = data.usage.prompt_tokens || 0;
        totalUsage.outputTokens += data.usage.completion_tokens || 0;
      }

      const choice = data.choices[0];
      const msg = choice.message;

      if (msg.content) {
        fullResponse += msg.content;
        await this.simulateStream(msg.content, onText);
      }

      messages.push(msg);

      if (choice.finish_reason !== "tool_calls" || !msg.tool_calls?.length) break;

      for (const toolCall of msg.tool_calls) {
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments);
        onToolUse(fn.name, args);
        const result = await options.toolExecutor(fn.name, args);
        onToolResult(fn.name, result);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
    }

    return { text: fullResponse, usage: totalUsage };
  }

  // ─── Gemini (Google) ──────────────────────────────────────────────

  private async sendGemini(options: SendMessageOptions): Promise<AIResponse> {
    const { model, systemPrompt, conversationHistory, onText, onToolUse, onToolResult } = options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any[] = conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const userParts = this.formatGeminiUserParts(options.userMessage, options.attachments || []);
    contents.push({ role: "user", parts: userParts });

    const toolDefs = options.tools || [];

    let fullResponse = "";
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    const apiKey = this.auth.geminiApiKey || "";

    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      };
      if (toolDefs.length > 0) {
        body.tools = [{
          functionDeclarations: toolDefs.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          })),
        }];
      }

      const response = await this.http({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        throw: false,
      });

      if (response.status !== 200) {
        throw new Error(`${response.status} ${response.text}`);
      }

      const data = response.json;

      if (data.usageMetadata) {
        totalUsage.inputTokens = data.usageMetadata.promptTokenCount || 0;
        totalUsage.outputTokens += data.usageMetadata.candidatesTokenCount || 0;
      }

      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error("No response from Gemini");

      const parts = candidate.content?.parts || [];
      const textParts: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const functionCalls: any[] = [];

      for (const part of parts) {
        if (part.text) {
          textParts.push(part.text);
          await this.simulateStream(part.text, onText);
        } else if (part.functionCall) {
          functionCalls.push(part.functionCall);
          onToolUse(part.functionCall.name, part.functionCall.args || {});
        }
      }

      fullResponse += textParts.join("");
      contents.push({ role: "model", parts: candidate.content.parts });

      if (functionCalls.length === 0) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const functionResponses: any[] = [];
      for (const fc of functionCalls) {
        const result = await options.toolExecutor(fc.name, fc.args || {});
        onToolResult(fc.name, result);
        functionResponses.push({
          functionResponse: { name: fc.name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: functionResponses });
    }

    return { text: fullResponse, usage: totalUsage };
  }

  // ─── Attachment formatters ───────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatClaudeUserContent(text: string, attachments: Attachment[]): any {
    if (attachments.length === 0) return text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [];
    for (const att of attachments) {
      if (att.type === "text") {
        blocks.push({ type: "text", text: `[File: ${att.name}]\n${att.data}` });
      } else if (att.type === "image") {
        blocks.push({ type: "image", source: { type: "base64", media_type: att.mimeType, data: att.data } });
      } else if (att.type === "pdf") {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: att.data } });
      }
    }
    blocks.push({ type: "text", text });
    return blocks;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatOpenAIUserContent(text: string, attachments: Attachment[]): any {
    if (attachments.length === 0) return text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];
    for (const att of attachments) {
      if (att.type === "text") {
        parts.push({ type: "text", text: `[File: ${att.name}]\n${att.data}` });
      } else if (att.type === "image") {
        parts.push({ type: "image_url", image_url: { url: `data:${att.mimeType};base64,${att.data}`, detail: "auto" } });
      } else if (att.type === "pdf") {
        parts.push({ type: "text", text: `[Attached PDF: ${att.name} — PDF not directly supported by this model]` });
      }
    }
    parts.push({ type: "text", text });
    return parts;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatGeminiUserParts(text: string, attachments: Attachment[]): any[] {
    if (attachments.length === 0) return [{ text }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];
    for (const att of attachments) {
      if (att.type === "text") {
        parts.push({ text: `[File: ${att.name}]\n${att.data}` });
      } else {
        parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
      }
    }
    parts.push({ text });
    return parts;
  }
}
