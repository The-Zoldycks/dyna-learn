import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { stripMarkdown } from "../utils/speechText";

const SPEEDS = [1, 1.25, 1.5, 2];

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch { return fallback; }
}

// Unified text-to-speech: Edge Neural (online) with browser SpeechSynthesis fallback.
// Owns voices, selected voice, speed, playback state and last speech text.
export function useTTS(apiBase) {
  const [browserVoices, setBrowserVoices] = useState([]);
  const [edgeVoices, setEdgeVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(
    () => readLS("dyna-voice", "en-US-AriaNeural")
  );
  const [playbackSpeed, setPlaybackSpeed] = useState(
    () => parseFloat(readLS("dyna-speech-speed", "1")) || 1
  );
  const [autoNarrate, setAutoNarrate] = useState(
    () => readLS("dyna-auto-narrate", "true") !== "false"
  );
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastSpeech, setLastSpeech] = useState("");

  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.removeAttribute("src"); audioRef.current.load(); } catch {}
      audioRef.current = null;
    }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  }, []);

  useEffect(() => () => { cleanupAudio(); window.speechSynthesis?.cancel(); }, [cleanupAudio]);
  useEffect(() => { if (selectedVoice) { try { localStorage.setItem("dyna-voice", selectedVoice); } catch {} } }, [selectedVoice]);

  // Voice lists
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${apiBase}/api/tts/voices`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => { if (data.voices?.length) setEdgeVoices(data.voices); })
      .catch(() => {});

    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      if (voices.length) setBrowserVoices(voices);
    };
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      ctrl.abort();
      window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, [apiBase]);

  const speakBrowser = useCallback((text) => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    cleanupAudio();
    const utterance = new SpeechSynthesisUtterance(text);
    const bv = browserVoices.find((v) => v.name === selectedVoice || v.voiceURI === selectedVoice);
    if (bv) utterance.voice = bv;
    utterance.rate = playbackSpeed; utterance.pitch = 1; utterance.volume = 1;
    utterance.lang = bv?.lang || "en-US";
    utterance.onstart  = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend    = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onerror  = () => { setIsSpeaking(false); setIsPaused(false); };
    utterance.onpause  = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);
    window.speechSynthesis.speak(utterance);
  }, [browserVoices, selectedVoice, playbackSpeed, cleanupAudio]);

  const speakEdge = useCallback(async (text) => {
    try {
      cleanupAudio();
      window.speechSynthesis?.cancel();
      setIsTTSLoading(true); setIsSpeaking(false); setIsPaused(false);

      const res = await fetch(`${apiBase}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 5000), voice: selectedVoice }),
      });
      if (!res.ok) throw new Error(`Edge TTS ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;

      audio.onplay   = () => { setIsTTSLoading(false); setIsSpeaking(true); setIsPaused(false); };
      audio.onpause  = () => { if (!audio.ended) setIsPaused(true); };
      audio.onended  = () => { setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false); cleanupAudio(); };
      audio.onerror  = () => { setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false); cleanupAudio(); };

      try {
        await audio.play();
      } catch (playErr) {
        if (playErr?.name === "AbortError") { cleanupAudio(); return true; }
        throw playErr;
      }
      return true;
    } catch (e) {
      cleanupAudio();
      setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false);
      if (e?.name === "AbortError") return true;
      console.warn("Edge TTS failed, falling back:", e.message);
      return false;
    }
  }, [apiBase, selectedVoice, playbackSpeed, cleanupAudio]);

  const isEdgeVoice = useCallback(
    (voice) => voice.includes("Neural") || edgeVoices.some((v) => v.id === voice),
    [edgeVoices]
  );

  const speakText = useCallback(async (text) => {
    if (!text) return;
    setLastSpeech(text);
    // Voice reads the rendered text — never raw markdown markers
    const plain = stripMarkdown(text);
    if (!plain) return;
    if (isEdgeVoice(selectedVoice)) {
      const ok = await speakEdge(plain);
      if (ok) return;
      toast.info("Falling back to browser voice", {
        duration: 2500,
        description: "Edge neural unavailable — using offline voice.",
      });
    }
    speakBrowser(plain);
  }, [selectedVoice, isEdgeVoice, speakEdge, speakBrowser]);

  const setAutoNarratePersisted = useCallback((val) => {
    setAutoNarrate(val);
    try { localStorage.setItem("dyna-auto-narrate", String(val)); } catch {}
  }, []);

  const cyclePlaybackSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const nextIndex = (SPEEDS.indexOf(prev) + 1) % SPEEDS.length;
      const next = SPEEDS[nextIndex !== -1 ? nextIndex : 0];
      try { localStorage.setItem("dyna-speech-speed", String(next)); } catch {}
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  const pauseSpeech = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) { audioRef.current.pause(); setIsPaused(true); return; }
    if (window.speechSynthesis?.speaking && !isPaused) { window.speechSynthesis.pause(); setIsPaused(true); }
  }, [isPaused]);

  const resumeSpeech = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play().then(() => setIsPaused(false)).catch(() => setIsPaused(false));
      return;
    }
    if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); }
  }, [isPaused]);

  const stopSpeech = useCallback(() => {
    cleanupAudio();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false); setIsPaused(false); setIsTTSLoading(false);
  }, [cleanupAudio]);

  const handleReplay = useCallback(() => {
    if (lastSpeech) speakText(lastSpeech);
  }, [lastSpeech, speakText]);

  return {
    browserVoices, edgeVoices, selectedVoice, setSelectedVoice,
    playbackSpeed, cyclePlaybackSpeed,
    autoNarrate, setAutoNarrate: setAutoNarratePersisted,
    isTTSLoading, isSpeaking, isPaused, lastSpeech, setLastSpeech,
    speakText, speakBrowser, speakEdge, isEdgeVoice,
    pauseSpeech, resumeSpeech, stopSpeech, handleReplay, cleanupAudio,
  };
}
