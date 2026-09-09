# Dyna-learn — Interactive AI Tutor (Monorepo)

Decoupled SPA + API Gateway + Gemini async state generator.

**Repo:** https://github.com/The-Zoldycks/dyna-learn
**Live:** Frontend https://dyna-learn.vercel.app · Backend https://dyna-learn.onrender.com

## Structure
```
Dyna-learn/
├── backend/   # Node + Express + @google/genai (gemini-3.1-flash-lite via GEMINI_MODEL)
│   ├── server.js (sliding window, fallback chain, canvas prompt cap, edge TTS, rate limiting)
│   ├── Dockerfile (node:18-alpine, Render deploy)
│   ├── .env (GEMINI_API_KEY, PORT, FRONTEND_URL, GEMINI_MODEL — gitignored)
│   └── package.json (type: module)
├── frontend/  # Vite + React + Tailwind + @xyflow/react
│   ├── src/App.jsx (ReactFlow canvas + hybrid TTS + lifecycle)
│   ├── src/components/ (CustomNode, ChatSkeleton, QuizCard, JournalModal, SimpleMarkdown)
│   ├── src/utils/ (layout.js dagre, storage.js streak/snapshots/SRS)
│   ├── vercel.json (SPA rewrites)
│   └── vite.config.js (tailwindcss plugin)
└── render.yaml (Render Blueprint, backend docker service)
```

## Lifecycle (Learning Loop)
1. Trigger: click node (selectedNodeId) + type question, attach screenshot, or use voice input
2. Dispatch: POST `/api/tutor` { studentQuestion, canvasState, chatHistory (last 6), selectedNodeId, image? }
3. Process: Express stitches canvasState (capped to most-recent 30 nodes for the prompt) + chatHistory sliding window + selectedNode into systemInstruction
4. Generation: Gemini 3.1 Flash Lite (fallback chain: 3-flash-preview, flash-latest) returns {speech_text, quiz?, diagram_update: {action, nodes, edges}} with actions add_nodes | add_edges | update_nodes | clear_canvas | quiz | none
5. Render: hybrid TTS speaks `speech_text` + ReactFlow updates via dagre auto-layout; quiz renders as `QuizCard` when action is `quiz`
> Note: gemini-2.5-flash no longer available to new API keys (returns 404). Backend uses GEMINI_MODEL env + fallback chain; see deprecation logs.

## Quickstart
```bash
# backend
cd backend
npm install
# set GEMINI_API_KEY in .env (see .env.example)
npm run dev # http://localhost:3000

# frontend
cd ../frontend
npm install
npm run dev # http://localhost:5173
```
Vite reads `VITE_BACKEND_URL` from `.env.development` (localhost) / `.env.production` (Render URL). In Vercel Dashboard set `VITE_BACKEND_URL=https://dyna-learn.onrender.com`.

## API Contract
POST /api/tutor
```json
{
  "studentQuestion": "How does DB connect?",
  "canvasState": { "nodes": [], "edges": [] },
  "chatHistory": [{"role":"user","text":"hi"},{"role":"model","text":"hello"}],
  "selectedNodeId": "node-1",
  "image": { "base64": "...", "mimeType": "image/png" }
}
```
Response enforced via responseMimeType: application/json + responseSchema (`speech_text`, optional `quiz` with 3 multiple-choice questions, `diagram_update`).

GET /api/tts/voices → `{voices: [{id, label, lang}], mode}` (Edge neural list, live from Microsoft).
POST /api/tts `{text, voice}` → `audio/mpeg` MP3 (self-hosted, truncated at 5000 chars).

## Frontend Actions & update_nodes Highlight UI

| Action | Payload Example | UI Effect (dagre + CustomNode) | When LLM Uses It |
|---|---|---|---|
| `add_nodes` | `{"nodes":[{"id":"planning","label":"Planning","icon":"clipboard","shape":"rectangle"}],"edges":[{"id":"e1","source":"planning","target":"design"}]}` | Appends nodes + edges, auto-layout via dagre TB grid, smoothstep edges | New concepts |
| `add_edges` | `{"edges":[{"id":"e1","source":"a","target":"b","label":"powers"}]}` | Appends smoothstep connections only | Linking existing nodes |
| `update_nodes` | `{"nodes":[{"id":"testing","highlight":true,"icon":"bug"}]}` | Rose ring highlight + dot, tooltip “Highlighted — confusion detected”, no relayout (preserves positions); logged to SRS review queue | Student confusion matched to `selectedNodeId` (see `highlight:true`). Auto-fitView to highlighted node |
| `clear_canvas` | `{"nodes":[]}` | Resets to welcome pill `start`, toasts “Canvas cleared” | User clear or topic pivot |
| `quiz` | root `quiz: {questions: [{question, options[4], correct_index, explanation}]}` | Renders `QuizCard` (lock-after-answer, per-question explanations); score updates SRS item | Student explicitly asks to be tested |
| `none` | `{"nodes":[]}` | No canvas change, speech still plays | Off-topic redirect |

> Highlight docs: `highlight:boolean` — frontend maps via `CustomNode.jsx`. Use `icon` from broad library (`clipboard/palette/code/bug/rocket/wrench/database/server/cloud/lock/file/user/layers/cog/shield/book/lightbulb/network/cpu/brain`) — fallback heuristic `inferIcon()` covers common CS concepts. Dagre strips `position`; LLM must not guess x/y. Canvas sent to the prompt is capped at the most-recent 30 nodes.

## UX Polish

- **Toasts (sonner):** `frontend/src/main.jsx` `<Toaster bottom-right>`. Success (Canvas cleared) auto-dismiss 3.5s; LLM errors sticky with `Retry` action that replays exact `payload` (no stale closure) + `Dismiss`.
- **Loading:** Chat-only `ChatSkeleton` pulses in left panel while `loading`; canvas stays interactive (pan/zoom) with subtle corner spinner — no overlay. Mini-player shows `Loading audio…` state during TTS fetch.
- **Nodes:** `CustomNode` `rounded-2xl` presets (`rectangle/pill/diamond/circle` all sleek rounded), slate handles, rose-ring highlight / violet-ring selection. Selected nodes show an “Ask about this” toolbar that fills the question box.
- **Markdown:** `SimpleMarkdown` renders `**bold**`, `` `code` ``, lists in chat bubbles (zero deps).
- **Error handling:** Backend returns `{code}` (`GEMINI_RATE_LIMIT` 429, `TUTOR_RATE_LIMIT`, `TTS_RATE_LIMIT` etc.) mapped to toast descriptions.
- **Persistence:** Canvas + chat survive reload via `sessionStorage`; lessons can be saved as snapshots (`localStorage`, max 20, images stripped) and reloaded from the Learning Journal.
- **Journal & SRS:** Learning Journal modal tracks daily streak, saved lessons, and SM-2 spaced-repetition reviews (confused concepts auto-queued, 12h first review).
- **Sharing:** `Share` encodes canvas + chat into URL hash (`#s=` with size guard); opening the link restores the lesson.
- **Export:** Diagram exports as SVG (bezier edges, node rects).
- **Voice input:** Browser `SpeechRecognition` dictation into the question box.

## TTS — Unified Voices (Edge Neural + Offline, No Cold Start)

Self-hosted Microsoft Edge TTS in-process (`node-edge-tts`, same engine as Toolbox-backend) — no external fetch, no API key, stays warm with the backend.

| Group | Voices | Source |
|---|---|---|
| Neural — Edge (online) | Live list from `GET /api/tts/voices` (e.g. `en-US-AriaNeural`, filtered `en/zh/ja/ko`, ~30) | `POST /api/tts` → `audio/mpeg` via `EdgeTTS.ttsPromise` (temp mp3, async `fs.promises` read) |
| Offline / Standard | Device voices via `speechSynthesis.getVoices()` | Browser `SpeechSynthesisUtterance`, instant + offline |

- **Selector:** Single unified dropdown in the Voice card (`optgroup` Neural top / Offline bottom). Persists to `localStorage` (`dyna-voice`).
- **Hybrid speak:** `speakText` tries Edge (`Audio` blob, same `isSpeaking/isPaused` state) then falls back to browser with toast on failure. Pause/Resume/Stop unified via `audioRef` + `speechSynthesis`.
- **History:** An earlier iteration proxied Qwen3-TTS via DashScope (`DASHSCOPE_API_KEY`), but that needed paid model activation in Bailian console — dropped in favor of the keyless self-hosted Edge engine.

## Deployment

- **Frontend (Vercel):** `frontend/vercel.json` SPA rewrites; env `VITE_BACKEND_URL=https://dyna-learn.onrender.com` (Production and Preview, redeploy after change).
- **Backend (Render):** `render.yaml` Blueprint + `backend/Dockerfile`; env `GEMINI_API_KEY`, `FRONTEND_URL=https://dyna-learn.vercel.app`. CORS allowlist covers localhost dev + Vercel prod; per-IP rate limits (20/min tutor, 30/min TTS).
- **Keep-awake:** UptimeRobot `HTTP(s)` monitor on `https://dyna-learn.onrender.com/` every 5 minutes (root returns 200 JSON) to prevent free-tier spin-down.
