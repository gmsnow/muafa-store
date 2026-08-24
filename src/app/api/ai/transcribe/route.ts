import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/features/auth/session";

/**
 * Cloudflare Workers AI speech-to-text proxy (Whisper).
 * Receives multipart/form-data { audio: Blob }, forwards it to the
 * AI run endpoint with the server-only token, returns { text }.
 * Credentials never leave the server.
 */
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
  console.log(`[ai/transcribe] model=${model} language=${language}`);

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

  return NextResponse.json({ text: payload.result.text.trim() });
}
