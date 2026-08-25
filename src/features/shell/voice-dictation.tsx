"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Voice input for any focused field.
 * - aiMode (Cloudflare Workers AI Whisper configured): press to record, press again
 *   to stop → audio goes to /api/ai/transcribe → text inserted at the cursor.
 *   Works on every modern mobile browser (MediaRecorder), incl. iOS Safari.
 * - Otherwise: live Web Speech API dictation (Chrome/Edge/Safari).
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: Event) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event) => void) | null;
}

interface SRResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function VoiceDictation({ aiMode = false }: { aiMode?: boolean }) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [hasTarget, setHasTarget] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wantListenRef = useRef(false);
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const baseRef = useRef(""); // value snapshot + finalized chunks

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const editable =
        (el instanceof HTMLInputElement &&
          ["text", "search", "tel", "url", "email", "number", ""].includes(el.type)) ||
        el instanceof HTMLTextAreaElement;
      if (editable) {
        targetRef.current = el as HTMLInputElement | HTMLTextAreaElement;
        setHasTarget(true);
      }
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      wantListenRef.current = false;
      recRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, []);

  function applyToTarget(text: string) {
    const el = targetRef.current;
    if (!el || !document.contains(el)) {
      toast.error("اضغط على حقل الإدخال أولاً ثم أعد المحاولة");
      return;
    }
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const after = el.value.slice(pos);
    const sep = before && !before.endsWith(" ") && text ? " " : "";
    setNativeValue(el, before + sep + text + after);
    const newPos = (before + sep + text).length;
    el.setSelectionRange(newPos, newPos);
  }

  // ---------- Cloudflare AI mode ----------
  async function toggleAiRecording() {
    if (listening || transcribing) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("المتصفح لا يدعم تسجيل الصوت — استخدم Chrome أو Safari حديث");
      return;
    }
    let stream: MediaStream;
    try {
      // Mono + browser DSP (echo cancel / noise suppress / AGC) gives the
      // recogniser a much cleaner signal than the default capture.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      toast.error("تم رفض الوصول إلى الميكروفون — اسمح به من إعدادات المتصفح");
      return;
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      // Higher opus bitrate keeps consonants of Arabic names intact.
      audioBitsPerSecond: 64_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setTranscribing(true);
      setInterim("");
      try {
        const type = mimeType?.split(";")[0] ?? "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunks, { type });
        const form = new FormData();
        form.append("audio", blob, `speech.${ext}`);
        // Global dictation targets arbitrary fields (often product/customer
        // search), so keep the store-vocabulary bias.
        form.append("context", "auto");
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (res.ok && data?.text) applyToTarget(data.text);
        else if (data?.error === "NO_ARABIC_SPEECH") toast.error("لم يتم التعرف على كلام عربي — تحدّث بالعربية وحاول مجددًا");
        else if (data?.error === "AI_NOT_CONFIGURED") toast.error("خدمة الذكاء الاصطناعي غير مهيأة بعد");
        else if (res.ok) toast.error("لم يتم التعرف على أي كلام — حاول مجددًا");
        else toast.error("فشل تحويل الصوت إلى نص — حاول مجددًا");
      } catch {
        toast.error("تعذر الاتصال بخدمة التحويل");
      } finally {
        setTranscribing(false);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setListening(true);
  }

  // ---------- Web Speech fallback ----------
  // Arabic-only: try Yemeni Arabic first, fall back to standard Saudi Arabic
  // if the engine reports the locale as unsupported.
  const AR_LOCALES = ["ar-YE", "ar-SA"];

  function startWebSpeech(localeIndex = 0) {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast.error("المتصفح لا يدعم الإدخال الصوتي — استخدم Chrome أو Safari الحديث");
      return;
    }
    const rec = new Ctor();
    rec.lang = AR_LOCALES[localeIndex] ?? "ar";
    rec.continuous = true;
    rec.interimResults = true;

    baseRef.current = targetRef.current?.value ?? "";
    rec.onresult = (e: Event) => {
      const ev = e as unknown as SRResultEvent;
      let finalChunk = "";
      let interimChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk) {
        baseRef.current = baseRef.current ? `${baseRef.current} ${finalChunk.trim()}` : finalChunk.trim();
      }
      setInterim(interimChunk);
      applyToTarget(baseRef.current + (interimChunk ? ` ${interimChunk}` : ""));
    };
    rec.onerror = (e: Event) => {
      const err = e as unknown as { error?: string };
      if (
        (err.error === "language-not-supported" || err.error === "language-unavailable") &&
        localeIndex < AR_LOCALES.length - 1
      ) {
        wantListenRef.current = false;
        try { rec.abort(); } catch { /* noop */ }
        startWebSpeech(localeIndex + 1);
        return;
      }
      if (err.error === "not-allowed" || err.error === "service-not-allowed") {
        wantListenRef.current = false;
        setListening(false);
        toast.error("تم رفض الوصول إلى الميكروفون — اسمح به من إعدادات المتصفح");
      }
    };
    rec.onend = () => {
      // Auto-restart while the user still wants dictation (engine stops on silence).
      if (wantListenRef.current) {
        try { rec.start(); return; } catch { /* start races are safe to ignore */ }
      }
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    wantListenRef.current = true;
    try { rec.start(); setListening(true); } catch { /* already started */ }
  }

  function stopWebSpeech() {
    wantListenRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }

  const active = listening || transcribing;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-9", listening && "bg-destructive/10 text-destructive")}
        aria-label="إدخال صوتي"
        title={
          transcribing ? "جارٍ تحويل الصوت إلى نص…"
          : listening ? (aiMode ? "إيقاف التسجيل والتحويل" : "إيقاف الإدخال الصوتي")
          : aiMode ? "تسجيل صوتي بالذكاء الاصطناعي — ضع المؤشر في الحقل ثم سجّل"
          : "إدخال صوتي — ضع المؤشر في أي حقل ثم تحدّث"
        }
        onClick={() =>
          aiMode ? toggleAiRecording() : listening ? stopWebSpeech() : startWebSpeech()
        }
      >
        {transcribing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Mic className={cn("size-4", listening && "animate-pulse")} />
        )}
      </Button>
      {active && (
        <div className="pointer-events-none absolute top-full z-50 mt-1 w-56 rounded-md border bg-popover p-2 text-xs shadow-md end-0">
          {transcribing ? (
            <p className="text-muted-foreground" dir="rtl">جارٍ تحويل الصوت إلى نص…</p>
          ) : hasTarget ? (
            <p className="truncate text-muted-foreground" dir="rtl">{aiMode ? "يسجّل… اضغط للإيقاف" : interim || "تحدّث الآن…"}</p>
          ) : (
            <p className="text-muted-foreground" dir="rtl">اضغط على أي حقل إدخال أولاً</p>
          )}
        </div>
      )}
    </div>
  );
}
