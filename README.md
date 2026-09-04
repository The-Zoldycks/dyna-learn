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

## Frontend Actions
- add_nodes: append nodes (and optional edges)
- add_edges: append edges
- update_nodes: merge by id, highlight:true => red border
- clear_canvas: reset to initialNodes
