import GlideSelect from "./GlideSelect.jsx";

// VoiceSelect — thin wrapper that maps our voice sources into the
// GlideSelect micro-select: Neural voices tagged, Offline/browser tagged,
// grouped by the tag field instead of two optgroups so the gliding pill
// can travel across the whole list.
export default function VoiceSelect({ edgeVoices, browserVoices, selectedVoice, setSelectedVoice }) {
  const options = [
    ...(edgeVoices.length
      ? edgeVoices.map((v) => ({ value: v.id, label: v.label, tag: "Neural" }))
      : [{ value: "en-US-AriaNeural", label: "Aria — Warm female (US) — loading…", tag: "Neural" }]),
    ...(browserVoices.length
      ? browserVoices.map((v) => ({ value: v.name, label: `${v.name} — ${v.lang}`, tag: "Offline" }))
      : [{ value: "", label: "Default system voice", tag: "Offline" }]),
  ];

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
