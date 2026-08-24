import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/features/auth/session";

/**
 * Cloudflare Workers AI speech-to-text with a two-pass "smart Arabic" pipeline:
 *   1. Whisper large-v3-turbo transcribes (language hint + Yemeni-dialect
 *      prompt + VAD filtering).
 *   2. An instruction-tuned LLM (default Llama 3.3 70B fp8-fast) refines the
 *      raw transcript: fixes recognition/spelling slips, normalises spoken
 *      numbers to Western digits, keeps grocery vocabulary intact.
 *   3. Output is Arabic-only: Latin-script runs are stripped and clips with
 *      no recognisable Arabic speech are rejected (422 NO_ARABIC_SPEECH).
 * Credentials never leave the server. Set CLOUDFLARE_AI_CORRECT=off to skip
 * pass 2, or override models via CLOUDFLARE_AI_MODEL /
 * CLOUDFLARE_AI_CORRECT_MODEL.
 */

// Two upstream AI calls (transcribe + refine) need more than platform defaults.
export const maxDuration = 60;

/** Strip Latin-script runs; keep Arabic script, digits and whitespace. */
function stripNonArabic(text: string): string {
  return text
    .replace(/[A-Za-z][A-Za-z0-9'’\-_.]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * LLM refinement pass. Returns null on any failure so callers gracefully fall
 * back to the raw Whisper transcript.
 */
async function refineArabic(
  accountId: string,
  token: string,
  model: string,
  text: string,
): Promise<string | null> {
  const system =
    "أنت مصحّح نصوص تحويل الكلام إلى نص داخل محل بقالة يمني. " +
    "ستستلم نصًا خامًا من نموذج تعرّف صوتي كُتب بالعربية بلهجة يمنية وقد يحتوي أخطاء تعرّف وإملاء. " +
    "صحِّح الأخطاء واجعل الجُمل سليمة وواضحة، وحافظ على كلمات البقالة والأصناف كما نطقها المتحدث. " +
    "حوِّل الأعداد المنطوقة كتابةً إلى أرقام غربية (مثال: خمسة عشر ← 15، نص كيلو ← 0.5 كيلو). " +
    "أخرِج النص العربي المصحَّح فقط دون أي شرح أو مقدمات أو علامات اقتباس.";
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: text },
          ],
          max_tokens: 512,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; result?: { response?: string } }
      | null;
    const out = data?.result?.response;
    return typeof out === "string" && out.trim() ? out.trim() : null;
  } catch {
    return null; // graceful degradation: keep raw transcript
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }
  const model = process.env.CLOUDFLARE_AI_MODEL || "@cf/openai/whisper-large-v3-turbo";
  // Bias recognition toward the app's primary language (Arabic).
  // Only trust ISO-639-1-ish codes — anything else (e.g. "arabic", "ar-YE-dj")
  // makes Whisper ignore the hint and fall back to English.
  const rawLanguage = process.env.CLOUDFLARE_AI_LANGUAGE || "ar";
  const language = /^[a-z]{2,3}$/i.test(rawLanguage.trim()) ? rawLanguage.trim().toLowerCase() : "ar";
  const initialPrompt =
    process.env.CLOUDFLARE_AI_INITIAL_PROMPT ||
    "تسجيل صوتي بالعربية اللهجة اليمنية داخل محل بقالة. عبارات شائعة: دحين، زين، شيل، جيب لي، كم الريال، نص كيلو، ربع كيلو، رطل، علبة، كرتونة، لتر. أصناف: سكر، أرز بشاور، دقيق، زيت دوار الشمس، شاي أحمر، حبوب، لبنة، سمن بلدي، عسل سدر، بيض، مكرونة، هيل، قرنفل. حسابات: فاتورة بيع، فاتورة شراء، دفعة، سلفة، مدفوع نقداً، باقي عليه، ريال، مية ريال، ألف ريال.";

  const refineModel =
    process.env.CLOUDFLARE_AI_CORRECT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const refineEnabled = (process.env.CLOUDFLARE_AI_CORRECT ?? "on").trim().toLowerCase() !== "off";

  console.log(`[ai/transcribe] model=${model} language=${language} refine=${refineEnabled ? refineModel : "off"}`);

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "NO_AUDIO" }, { status: 400 });
  }
  if (audio.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await audio.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "NO_AUDIO" }, { status: 400 });
  }

  // whisper-large-v3-turbo takes a JSON payload and honours language/task hints;
  // the legacy @cf/openai/whisper only accepts raw audio bytes.
  const supportsHints = /turbo|large|v3/.test(model);

  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      supportsHints
        ? {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              audio: buffer.toString("base64"),
              task: "transcribe",
              language,
              initial_prompt: initialPrompt,
              // Skip non-speech segments so background noise is not
              // hallucinated into phantom words.
              vad_filter: true,
            }),
            signal: AbortSignal.timeout(60_000),
          }
        : {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": audio.type && audio.type.startsWith("audio/") ? audio.type : "audio/webm",
            },
            body: new Uint8Array(buffer),
            signal: AbortSignal.timeout(60_000),
          },
    );
  } catch {
    return NextResponse.json({ error: "AI_UPSTREAM_TIMEOUT" }, { status: 504 });
  }

  const payload = (await res.json().catch(() => null)) as
    | { success?: boolean; result?: { text?: string }; errors?: unknown[] }
    | null;

  if (!res.ok || !payload?.success || typeof payload.result?.text !== "string") {
    console.error("cloudflare ai error", res.status, payload?.errors ?? payload);
    return NextResponse.json({ error: "AI_TRANSCRIBE_FAILED" }, { status: 502 });
  }

  // Arabic-only enforcement: strip any Latin-script runs Whisper may emit
  // regardless of the language hint.
  const rawText = payload.result.text.trim();
  let text = stripNonArabic(rawText);

  // Smart refinement pass: let the LLM repair recognition errors using the
  // grocery/dialect context. Falls back to the raw transcript on failure.
  if (refineEnabled && hasArabic(text) && text.length >= 2) {
    const refined = await refineArabic(accountId, token, refineModel, text);
    if (refined) {
      const cleaned = stripNonArabic(refined).replace(/^["'«»\s]+|["'«»\s]+$/g, "");
      if (hasArabic(cleaned)) {
        console.log(`[ai/transcribe] refined "${text.slice(0, 80)}" -> "${cleaned.slice(0, 80)}"`);
        text = cleaned;
      }
    }
  }

  if (!hasArabic(text)) {
    console.log(`[ai/transcribe] rejected non-Arabic output: ${JSON.stringify(rawText.slice(0, 120))}`);
    return NextResponse.json({ error: "NO_ARABIC_SPEECH" }, { status: 422 });
  }

  return NextResponse.json({ text });
}
