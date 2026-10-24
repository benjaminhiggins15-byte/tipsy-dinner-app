import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// Mic recording + server transcription for Build's voice input. Owns the
// MediaRecorder lifecycle end-to-end so CookInputBar only ever sees
// { status, elapsedSeconds, errorMessage, start, stop, cancel, clearError }.
// transcribe-voice (Edge Function) never stores audio — this hook never
// uploads anywhere else either; the recorded Blob only ever goes to that
// one call and is discarded after.

export type VoiceRecordingStatus = "idle" | "recording" | "transcribing" | "error";

const MAX_RECORDING_SECONDS = 60;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

export function useVoiceRecording(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<VoiceRecordingStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Always releases the mic — called on stop, cancel, error, and unmount.
  const releaseMic = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => releaseMic, [releaseMic]);

  const transcribe = useCallback(async (blob: Blob, mimeType: string) => {
    setStatus("transcribing");
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-voice", {
        body: blob,
        headers: { "Content-Type": mimeType },
      });
      if (error) {
        setStatus("error");
        setErrorMessage("Couldn't transcribe that — try again.");
        return;
      }
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!text) {
        setStatus("error");
        setErrorMessage("Didn't catch that — try again.");
        return;
      }
      setStatus("idle");
      onTranscriptRef.current(text);
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't transcribe that — try again.");
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = false;
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    cancelledRef.current = true;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      releaseMic();
      setStatus("idle");
    }
  }, [releaseMic]);

  const start = useCallback(async () => {
    setErrorMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMessage("Voice input isn't supported on this device.");
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      setStatus("error");
      setErrorMessage("Voice input isn't supported on this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setStatus("error");
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMessage("Microphone access denied — enable it in your browser settings to use voice input.");
      } else if (name === "NotFoundError") {
        setErrorMessage("No microphone found on this device.");
      } else {
        setErrorMessage("Couldn't access the microphone.");
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    cancelledRef.current = false;

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const wasCancelled = cancelledRef.current;
      const chunks = chunksRef.current;
      releaseMic();
      if (wasCancelled) {
        setStatus("idle");
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        setStatus("error");
        setErrorMessage("Didn't catch that — try again.");
        return;
      }
      void transcribe(blob, mimeType);
    };

    recorder.start(1000);
    setStatus("recording");
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          stop();
        }
        return next;
      });
    }, 1000);
  }, [releaseMic, stop, transcribe]);

  const clearError = useCallback(() => {
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  return { status, elapsedSeconds, errorMessage, start, stop, cancel, clearError };
}
