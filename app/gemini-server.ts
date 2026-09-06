// Server-only: import this module from API routes, never from client components.
export const GEMINI_MODEL = "gemini-3.5-flash";

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

export async function generateGemini(options: {
  instructions: string;
  contents: GeminiContent[];
  schema?: object;
  search?: boolean;
}) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new Error("Gemini is not configured");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.instructions }] },
      contents: options.contents,
      ...(options.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: "low" },
        ...(options.schema ? { responseMimeType: "application/json", responseJsonSchema: options.schema } : {}),
      },
    }),
  });
  // Do not expose upstream bodies or request headers: they can contain secrets.
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const payload = await response.json() as GeminiPayload;
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text).join("").trim();
  if (!text || candidate?.finishReason !== "STOP") throw new Error("Gemini returned an incomplete response");
  if (!options.search) return text;
  const sources = new Map<string, string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri && /^https?:\/\//.test(chunk.web.uri)) sources.set(chunk.web.uri, chunk.web.title || "Source");
  }
  if (!sources.size) throw new Error("Gemini returned no web sources");
  return `${text}\n\nSources:\n${Array.from(sources).slice(0, 5).map(([url, title]) => `- ${title}: ${url}`).join("\n")}`;
}
