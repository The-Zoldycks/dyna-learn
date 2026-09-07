# Dyna-learn — Interactive AI Tutor (Monorepo)

Decoupled SPA + API Gateway + Gemini async state generator.

**Repo:** https://github.com/The-Zoldycks/dyna-learn

## Structure
```
Dyna-learn/
├── backend/   # Node + Express + @google/genai (gemini-3.1-flash-lite via GEMINI_MODEL)
│   ├── server.js (sliding window, fallback chain)
│   ├── .env (GEMINI_API_KEY, PORT=3000, FRONTEND_URL=http://localhost:5173, GEMINI_MODEL=gemini-3.1-flash-lite)
│   └── package.json (type: module)
└── frontend/  # Vite + React + Tailwind + @xyflow/react
    ├── src/App.jsx (ReactFlow canvas + SpeechSynthesis + lifecycle)
    └── vite.config.js (tailwindcss plugin)
```

## Lifecycle (Learning Loop)
1. Trigger: click node (selectedNodeId) + type question
2. Dispatch: POST http://localhost:3000/api/tutor { studentQuestion, canvasState, chatHistory (last 6), selectedNodeId }
3. Process: Express stitches canvasState + chatHistory (sliding window last 3 user + 3 AI) + selectedNode into systemInstruction
4. Generation: Gemini 3.1 Flash Lite (fallback chain: 3-flash-preview, flash-latest) returns {speech_text, diagram_update: {action, nodes, edges}} with actions add_nodes | add_edges | update_nodes | clear_canvas
5. Render: SpeechSynthesisUtterance + ReactFlow state update
> Note: gemini-2.5-flash no longer available to new API keys (returns 404). Backend uses GEMINI_MODEL env + fallback chain; see deprecation logs.

## Quickstart
```bash
# backend
cd backend
npm install
# set GEMINI_API_KEY in .env
npm run dev # http://localhost:3000

# frontend
cd ../frontend
npm install
npm run dev # http://localhost:5173
```

## API Contract
POST /api/tutor
```json
{
  "studentQuestion": "How does DB connect?",
  "canvasState": { "nodes": [], "edges": [] },
  "chatHistory": [{"role":"user","text":"hi"},{"role":"model","text":"hello"}],
  "selectedNodeId": "node-1"
}
```
Response enforced via responseMimeType: application/json + responseSchema.

## Frontend Actions & update_nodes Highlight UI

| Action | Payload Example | UI Effect (dagre + CustomNode) | When LLM Uses It |
|---|---|---|---|
| `add_nodes` | `{"nodes":[{"id":"planning","label":"Planning","icon":"clipboard","shape":"rectangle"}],"edges":[{"id":"e1","source":"planning","target":"design"}]}` | Appends nodes + edges, auto-layout via dagre TB grid, smoothstep edges | New concepts |
| `add_edges` | `{"edges":[{"id":"e1","source":"a","target":"b","label":"powers"}]}` | Appends smoothstep connections only | Linking existing nodes |
| `update_nodes` | `{"nodes":[{"id":"testing","highlight":true,"icon":"bug"}]}` | Red `bg-red-50 border-red-500` pulse + dot, tooltip “Highlighted — confusion detected”, no relayout (preserves positions), hover explanation; legend appears when any highlighted | Student confusion matched to `selectedNodeId` (see `server.js:115` `highlight:true`). Auto-fitView to highlighted node when present. |
| `clear_canvas` | `{"nodes":[]}` | Resets to welcome pill `start`, toasts “Canvas cleared” | User clear or topic pivot |
| `none` | `{"nodes":[]}` | No canvas change, drawer still shows speech | Off-topic redirect |

> Highlight docs: `backend/server.js:115` `highlight:boolean` — frontend maps via `CustomNode.jsx:34`. Use `icon` from 20-value broad library (`clipboard/palette/code/bug/rocket/wrench/database/server/cloud/lock/file/user/layers/cog/shield/book/lightbulb/network/cpu/brain`) — fallback heuristic `inferIcon()` covers 90% CS concepts. Dagre strips `position`; LLM must not guess x/y.

## UX Polish

- **Toasts (sonner):** `frontend/src/main.jsx:9` `<Toaster bottom-right>`. Success (Canvas cleared) auto-dismiss 3.5s; LLM errors (429/503/500) sticky `duration: Infinity` with `Retry` action that replays exact `payload` (no stale closure) + `Dismiss`.
- **Loading:** Chat-only `ChatSkeleton` (`components/ChatSkeleton.jsx`) pulses in left panel while `loading`; canvas stays interactive (pan/zoom) with subtle corner spinner `top-3 left-3` — no overlay.
- **Icons:** All nodes use `CustomNode` presets `rectangle/pill/diamond/circle` + lucide icons; highlight red overrides selection violet.
- **Error handling:** Backend returns `{code}` (`GEMINI_RATE_LIMIT` 429 etc.) mapped to toast descriptions.

## TTS — Selectable Voices (Hybrid, No Budget, No Cold Start)

No budget: defaults to free browser `SpeechSynthesis` (instant, offline, device voices). Optional Qwen3-TTS neural when `DASHSCOPE_API_KEY` set — 9 selectable voices without cold start (vs Toolbox Render 30s).

| Mode | Voices | Source | When |
|---|---|---|---|
| `Browser` (default) | Device voices via `speechSynthesis.getVoices()` (populated on load) | `App.jsx: speakBrowser` | No key, offline, 0s |
| `Qwen` | `Vivian/Serena/Uncle_Fu/Dylan/Eric/Ryan/Aiden/Ono_Anna/Sohee` — `GET /api/tts/voices` | `backend/server.js: QWEN_VOICES` proxied to DashScope `qwen-tts-realtime` | `DASHSCOPE_API_KEY` set, streaming 97ms |

- **Selector:** Left panel `Voice` card (Browser/Qwen toggle + dropdown). Persists to `localStorage` (`dyna-voice`, `dyna-tts-mode`). Qwen toggle disabled with hint when no key.
- **Hybrid speak:** `App.jsx: speakText` tries `POST /api/tts {text, voice}` → `audio/mpeg` blob → `Audio` play with same `isSpeaking/isPaused` state as browser (pause/resume/stop unified via `audioRef` + `speechSynthesis`). On `503 TTS_NO_KEY` or fetch fail, toasts `Falling back to browser voice` and auto-plays browser.
- **Backend:** `GET /api/tts/voices` returns `{voices, mode}`, `POST /api/tts` streams MP3 when key present else `503 TTS_NO_KEY` (frontend fallback). Free tier: keep `Browser`, add key later at https://dashscope.console.aliyun.com — no code change.
