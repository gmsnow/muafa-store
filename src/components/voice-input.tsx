"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Drop-in <VoiceInput> / <VoiceTextarea>: the wrapped field gets an embedded
 * mic button. Recording goes to /api/ai/transcribe (Cloudflare Whisper); the
 * returned text is inserted at the cursor position and a normal input event
 * fires, so react-hook-form register() keeps working unchanged.
 */

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function useVoiceInsert() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const insertAtCursor = useCallback((el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const after = el.value.slice(pos);
    const sep = before && !before.endsWith(" ") && text ? " " : "";
    const value = before + sep + text + after;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    const newPos = (before + sep + text).length;
    el.setSelectionRange(newPos, newPos);
  }, []);

  const toggle = useCallback(async (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!el) return;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("المتصفح لا يدعم تسجيل الصوت");
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
      toast.error("اسمح بالوصول إلى الميكروفون من إعدادات المتصفح");
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
      setRecording(false);
      setTranscribing(true);
      try {
        const type = mimeType?.split(";")[0] ?? "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const form = new FormData();
        form.append("audio", new Blob(chunks, { type }), `speech.${ext}`);
        // Free-form field (notes/descriptions): disable store-name seeding so
        // dictation is not polluted with product/customer names.
        form.append("context", "note");
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (res.ok && data?.text) insertAtCursor(el, data.text);
        else if (data?.error === "NO_ARABIC_SPEECH") toast.error("لم يتم التعرف على كلام عربي — تحدّث بالعربية وحاول مجددًا");
        else if (res.ok) toast.error("لم يتم التعرف على أي كلام — حاول مجددًا");
        else toast.error(data?.error === "AI_NOT_CONFIGURED" ? "خدمة الصوت غير مهيأة بعد" : "فشل تحويل الصوت إلى نص");
      } catch {
        toast.error("تعذر الاتصال بخدمة التحويل");
      } finally {
        setTranscribing(false);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, [insertAtCursor]);

  return { recording, transcribing, toggle };
}

type FieldProps<T extends "input" | "textarea"> = Omit<React.ComponentProps<T>, "ref" | "className"> & {
  ref?: React.Ref<HTMLElement>;
  className?: string;
};

function MicButton({
  recording,
  transcribing,
  onClick,
}: {
  recording: boolean;
  transcribing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="تعبئة الحقل بالصوت"
      title={recording ? "إيقاف التسجيل والتحويل إلى نص" : "تعبئة الحقل بالصوت"}
      onClick={onClick}
      className={cn(
        "absolute end-1.5 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        recording && "bg-destructive/10 text-destructive",
      )}
    >
      {transcribing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Mic className={cn("size-3.5", recording && "animate-pulse")} />
      )}
    </button>
  );
}

export function VoiceInput({ ref: propRef, className, disabled, readOnly, ...props }: FieldProps<"input">) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const { recording, transcribing, toggle } = useVoiceInsert();

  const setRef = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof propRef === "function") propRef(el as never);
    else if (propRef && typeof propRef === "object") {
      (propRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Input {...(props as React.ComponentProps<"input">)} ref={setRef} disabled={disabled} readOnly={readOnly} className={cn("pe-8", className)} />
      {!disabled && !readOnly && (
        <MicButton recording={recording} transcribing={transcribing} onClick={() => void toggle(innerRef.current)} />
      )}
    </div>
  );
}

export function VoiceTextarea({ ref: propRef, className, disabled, readOnly, ...props }: FieldProps<"textarea">) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const { recording, transcribing, toggle } = useVoiceInsert();

  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof propRef === "function") propRef(el as never);
    else if (propRef && typeof propRef === "object") {
      (propRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea {...(props as React.ComponentProps<"textarea">)} ref={setRef} disabled={disabled} readOnly={readOnly} className={cn("pe-8", className)} />
      {!disabled && !readOnly && (
        <MicButton recording={recording} transcribing={transcribing} onClick={() => void toggle(innerRef.current)} />
      )}
    </div>
  );
}
