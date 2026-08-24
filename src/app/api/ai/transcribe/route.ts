import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { db } from "@/shared/db";

/**
 * Cloudflare Workers AI speech-to-text with a two-pass "smart Arabic" pipeline:
 *   1. Whisper large-v3-turbo transcribes (language hint + VAD filtering +
 *      an initial prompt seeded with THIS store's real product/customer names).
 *   2. An instruction-tuned LLM (default Llama 3.3 70B fp8-fast) repairs only
 *      spelling/recognition slips against the same store vocabulary — it is
 *      forbidden from rewording or substituting words.
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

// --- Store vocabulary (real names from the DB) -------------------------------
// Generic models mishear local product/customer names; seeding both passes
// with the actual names used in this shop dramatically reduces that.

const VOCAB_TTL_MS = 60_000;
let vocabCache: { at: number; text: string } | null = null;

async function loadVocabulary(): Promise<string> {
  if (vocabCache && Date.now() - vocabCache.at < VOCAB_TTL_MS) return vocabCache.text;
  try {
    const [products, customers, suppliers, brands] = await Promise.all([
      db.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { nameAr: true, name: true },
        take: 120,
      }),
      db.customer.findMany({
        where: { deletedAt: null, isActive: true },
        select: { nameAr: true, name: true },
        take: 50,
      }),
      db.supplier.findMany({
        where: { deletedAt: null, isActive: true },
        select: { nameAr: true, name: true },
        take: 40,
      }),
      db.brand.findMany({
        where: { isActive: true },
        select: { nameAr: true, name: true },
        take: 25,
      }),
    ]);
    const ar = (r: { nameAr: string | null; name: string }) => (r.nameAr || r.name || "").trim();
    const text = [...new Set([...products, ...brands, ...customers, ...suppliers].map(ar))]
      .filter(Boolean)
      .join("، ");
    vocabCache = { at: Date.now(), text };
    return text;
  } catch {
    return ""; // DB hiccup: continue without vocabulary rather than fail
  }
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
  vocabulary: string,
): Promise<string | null> {
  const rules =
    "\n" +
    "قواعد إلزامية:\n" +
    "1) لا تعِد صياغة الجملة ولا تضِف أو تحذِف أي معلومة — انقل كلام المتحدث كما هو.\n" +
    "2) لا تستبدل أي كلمة بكلمة أخرى؛ صحِّح أخطاء الإملاء وفصل الكلمات فقط.\n" +
    "3) إذا شابهت كلمة مشوّهة اسمًا من قائمة الأسماء فأعِد الاسم كما هو حرفيًا؛ وإلا اترك الكلمة كما نُطقت تمامًا حتى لو بدت غريبة.\n" +
    "4) حوِّل الأعداد المنطوقة كتابةً إلى أرقام غربية فقط (مثال: خمسة عشر ← 15).\n" +
    "5) أعِد النص العربي النهائي فقط، دون أي شرح أو مقدمات أو علامات اقتباس.";
  const system =
    "أنت مصحّح نصوص تحويل الكلام إلى نص داخل محل بقالة يمني. " +
    "ستستلم نصًا خامًا من نموذج تعرّف صوتي كُتب بالعربية بلهجة يمنية وقد يحتوي أخطاء تعرّف وإملاء." +
    (vocabulary
      ? "\nقائمة الأسماء الحقيقية في هذا المحل (أصناف وعلامات وعملاء وموردون):\n" +
        vocabulary.slice(0, 2500) +
        "\n"
      : "") +
    rules;
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

  // Whisper's initial_prompt has a hard token budget (~224 tokens), so when we
  // have real store names we spend it on those instead of generic phrases.
  const vocabulary = await loadVocabulary();
  const initialPrompt = process.env.CLOUDFLARE_AI_INITIAL_PROMPT
    ? process.env.CLOUDFLARE_AI_INITIAL_PROMPT
    : vocabulary
      ? `تسجيل صوتي بالعربية اللهجة اليمنية داخل محل بقالة. أسماء الأصناف والعلامات والأشخاص في المحل: ${vocabulary.slice(0, 600)}`
      : "تسجيل صوتي بالعربية اللهجة اليمنية داخل محل بقالة. عبارات شائعة: دحين، زين، شيل، جيب لي، كم الريال، نص كيلو، ربع كيلو، رطل، علبة، كرتونة، لتر. أصناف: سكر، أرز بشاور، دقيق، زيت دوار الشمس، شاي أحمر، حبوب، لبنة، سمن بلدي، عسل سدر، بيض، مكرونة، هيل، قرنفل. حسابات: فاتورة بيع، فاتورة شراء، دفعة، سلفة، مدفوع نقداً، باقي عليه، ريال، مية ريال، ألف ريال.";

  const refineModel =
    process.env.CLOUDFLARE_AI_CORRECT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const refineEnabled = (process.env.CLOUDFLARE_AI_CORRECT ?? "on").trim().toLowerCase() !== "off";

  console.log(
    `[ai/transcribe] model=${model} language=${language} refine=${refineEnabled ? refineModel : "off"} vocab=${vocabulary ? vocabulary.length : 0}ch`,
  );

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

  // Smart refinement pass: repair recognition/spelling errors against the real
  // store vocabulary. The LLM may NOT reword — worst case we keep the raw
  // transcript verbatim.
  if (refineEnabled && hasArabic(text) && text.length >= 2) {
    const refined = await refineArabic(accountId, token, refineModel, text, vocabulary);
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
