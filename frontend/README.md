# Dyna-learn Frontend — Interactive AI Tutor SPA

Vite + React 19 + Tailwind CSS 4 + ReactFlow (`@xyflow/react`) + dagre auto-layout.

## Scripts

```bash
npm run dev      # local dev (reads .env.development)
npm run build    # production build (reads .env.production)
npm run preview  # preview the production build
npm run lint     # oxlint (must exit 0 in CI)
```

## Environment

| File | Purpose |
|---|---|
| `.env.development` | `VITE_BACKEND_URL=http://localhost:3000` (local backend) |
| `.env.production` | `VITE_BACKEND_URL=https://dyna-learn.onrender.com` (Render backend) |
| `.env.example` | Template for new contributors |

`VITE_*` vars are baked in at **build time** — changing the backend URL in Vercel requires a redeploy.

## Structure

```
src/
├── App.jsx               # monolithic tutor shell (chat, canvas, TTS, journal wiring)
├── main.jsx              # entry + sonner <Toaster>
├── index.css             # tailwind import + reduced-motion guard
├── components/
│   ├── CustomNode.jsx    # icon + shape node renderer (Ask-AI toolbar)
│   ├── ChatSkeleton.jsx  # loading placeholder (chat only)
│   ├── QuizCard.jsx      # multiple-choice quiz (a11y: group + live regions)
│   ├── JournalModal.jsx  # streak, snapshots, SRS reviews (lazy-loaded)
│   └── SimpleMarkdown.jsx# zero-dep bold/code/list renderer
└── utils/
    ├── layout.js         # dagre TB auto-layout (LLM positions ignored)
    └── storage.js        # streak, snapshots (max 20), SM-2 SRS queue
public/
├── dyna-learn-logo-blue.png  # header logo
└── dyna-learn-doc-icon.png   # favicon
```
