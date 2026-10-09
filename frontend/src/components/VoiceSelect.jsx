import GlideSelect from "./GlideSelect.jsx";

// VoiceSelect — thin wrapper that maps our voice sources into the
// GlideSelect micro-select.
//
// Edge neural voices are the real list: a curated, accent-labelled set from
// the backend. The browser's own speechSynthesis voices are only an offline
// fallback — they are shown when Edge TTS is unreachable, never alongside it,
// because dumping ~50 system voices (most of them non-English) next to a
// curated twelve makes the picker unusable.
export default function VoiceSelect({ edgeVoices, browserVoices, selectedVoice, setSelectedVoice }) {
  const neural = edgeVoices.length
    ? edgeVoices.map((v) => ({ value: v.id, label: v.label, tag: "Neural" }))
    : // No Edge list yet (or it failed): fall back to the system voices.
      browserVoices.map((v) => ({
        value: v.name || v.voiceURI,
        label: voiceName(v),
        tag: "Offline",
      }));

  const options = neural.length ? neural : [{ value: "", label: "Default system voice", tag: "Offline" }];

  return (
    <GlideSelect
      options={options}
      value={selectedVoice}
      onChange={(value) => setSelectedVoice(value)}
      placeholder="Choose a voice"
      size="md"
      radius={12}
      ariaLabel="Choose a narration voice"
      menuWidth={null}
      className="w-full"
    />
  );
}

// "Microsoft David - English (United States) - English (United States)"
// becomes "David — English (US)".
function voiceName(v) {
  const raw = String(v.name || v.voiceURI || "System voice");
  const short = raw.replace(/^Microsoft\s+/i, "").split(/\s+-\s+/)[0].trim();
  return short || raw;
}