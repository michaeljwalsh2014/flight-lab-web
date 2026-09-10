// Server-only: import this module from API routes, never from client components.
export const GEMINI_MODEL = "gemini-3.5-flash";
export const GEMINI_ADVANCED_MODEL = "gemini-3.8-flash";
export const GEMINI_FAST_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite";

export class AIError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(code: string, status: number, retryable = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function publicAIError(error: unknown, search = false) {
  const failure = error instanceof AIError ? error : new AIError("invalid_response", 502, true);
  const messages: Record<string, string> = {
    rate_limited: search ? "Live search has reached its usage limit. Choose Answer to ask without web search, or try again later." : "The AI usage limit has been reached. Please try again later.",
    unavailable: "The AI service is temporarily busy. We tried a backup connection; please try again shortly.",
    timeout: "The AI service took too long to respond. Please try again.",
    not_configured: "The AI connection needs attention. Please try again later.",
    blocked: "The AI could not process this request. Try rephrasing it or choosing a clearer image.",
    no_sources: "Live search returned no usable sources. Try a more specific question, or choose Answer.",
    invalid_response: "The AI returned an incomplete response. Please try again.",
  };
  return { status: failure.status, body: { error: failure.code, message: messages[failure.code] ?? messages.unavailable, retryable: failure.retryable } };
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiPayload = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
};

export function geminiAvailable() {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

type GeminiOptions = {
  instructions: string;
  contents: GeminiContent[];
  schema?: object;
  search?: boolean;
  thinkingLevel?: "minimal" | "low" | "medium" | "high" | null;
  preferFastModel?: boolean;
  preferAdvancedModel?: boolean;
  maxOutputTokens?: number;
};

export async function generateGeminiResult(options: GeminiOptions) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new AIError("not_configured", 503);
  const primaryModel = options.preferAdvancedModel ? GEMINI_ADVANCED_MODEL : GEMINI_MODEL;
  const models = options.preferFastModel
    ? [GEMINI_FAST_MODEL, primaryModel, GEMINI_FALLBACK_MODEL]
    : [primaryModel, GEMINI_FAST_MODEL, GEMINI_FALLBACK_MODEL];
  for (const [attempt, model] of models.entries()) {
    try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.instructions }] },
      contents: options.contents,
      ...(options.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens ?? 4096,
        ...(options.thinkingLevel === null ? {} : { thinkingConfig: { thinkingLevel: options.thinkingLevel ?? (model === GEMINI_ADVANCED_MODEL ? "medium" : model === GEMINI_MODEL ? "low" : "minimal") } }),
        ...(options.schema ? { responseMimeType: "application/json", responseJsonSchema: options.schema } : {}),
      },
    }),
  });
  // Do not expose upstream bodies or request headers: they can contain secrets.
  if (!response.ok) {
    if (response.status === 429) throw new AIError("rate_limited", 429);
    if (response.status === 401 || response.status === 403) throw new AIError("not_configured", 503);
    throw new AIError("unavailable", 502, response.status >= 500 || response.status === 404);
  }
  const payload = await response.json() as GeminiPayload;
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text).join("").trim();
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "RECITATION") throw new AIError("blocked", 422);
  if (!text || candidate?.finishReason !== "STOP") throw new AIError("invalid_response", 502, true);
  if (!options.search) return { text, model };
  const sources = new Map<string, string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri && /^https?:\/\//.test(chunk.web.uri)) sources.set(chunk.web.uri, chunk.web.title || "Source");
  }
  if (!sources.size) throw new AIError("no_sources", 502);
  return { text: `${text}\n\nSources:\n${Array.from(sources).slice(0, 5).map(([url, title]) => `- ${title}: ${url}`).join("\n")}`, model };
    } catch (error) {
      const failure = error instanceof AIError ? error : new AIError(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "unavailable", 502, true);
      console.warn("flight_lab_ai_failure", { code: failure.code, status: failure.status, model, attempt: attempt + 1, search: Boolean(options.search) });
      if (!failure.retryable || attempt === models.length - 1) throw failure;
    }
  }
  throw new AIError("unavailable", 502, true);
}

export async function generateGemini(options: GeminiOptions) {
  return (await generateGeminiResult(options)).text;
}
