import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
// Fallback chain for new-user 404 on 2.5 models (see https://ai.google.dev/gemini-api/docs/deprecations)
// Valid new-user models per ListModels: 3.x family + aliases
const FALLBACK_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite-preview",
];

// TTS — self-hosted edge-tts (Toolbox parity, no external fetch, no cold start)
const EDGE_VOICE_FALLBACK = [
  { id: "en-US-AriaNeural", label: "Aria — Warm female (US)", lang: "English", locale: "en-US" },
  { id: "en-US-JennyNeural", label: "Jenny — Friendly female (US)", lang: "English", locale: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy — Mature male (US)", lang: "English", locale: "en-US" },
  { id: "en-GB-SoniaNeural", label: "Sonia — Bright female (UK)", lang: "English", locale: "en-GB" },
  { id: "en-GB-RyanNeural", label: "Ryan — Youthful male (UK)", lang: "English", locale: "en-GB" },
  { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao — Young female (CN)", lang: "Chinese", locale: "zh-CN" },
  { id: "zh-CN-YunxiNeural", label: "Yunxi — Young male (CN)", lang: "Chinese", locale: "zh-CN" },
  { id: "ja-JP-NanamiNeural", label: "Nanami — Young female (JP)", lang: "Japanese", locale: "ja-JP" },
  { id: "ko-KR-SunHiNeural", label: "SunHi — Young female (KR)", lang: "Korean", locale: "ko-KR" },
];

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Dyna-learn backend running", port: PORT });
});

// POST /api/tutor - Interactive AI Tutor endpoint with lifecycle alignment
app.post("/api/tutor", async (req, res) => {
  try {
    const {
      studentQuestion,
      flowchartState,
      canvasState,
      chatHistory = [],
      selectedNodeId = null,
    } = req.body;

    if (!studentQuestion) {
      return res.status(400).json({ error: "studentQuestion is required" });
    }

    // Support both legacy flowchartState and new canvasState (monorepo contract)
    const effectiveCanvas = canvasState || flowchartState || { nodes: [], edges: [] };

    // Sliding window: retain last 6 conversation turns (3 user prompts + 3 AI responses)
    // chatHistory expected as array of {role: "user"|"model", text: string} or {role, content}
    const normalizedHistory = (Array.isArray(chatHistory) ? chatHistory : []).map((entry) => ({
      role: entry.role === "model" || entry.role === "assistant" ? "model" : "user",
      text: entry.text || entry.content || entry.message || "",
    })).filter((e) => e.text && e.text.trim().length > 0);

    const windowedHistory = normalizedHistory.slice(-6);

    // Resolve selected node details from canvas for richer prompt
    let selectedNodeContext = null;
    if (selectedNodeId && effectiveCanvas.nodes) {
      const found = effectiveCanvas.nodes.find((n) => n.id === selectedNodeId);
      if (found) {
        selectedNodeContext = {
          id: found.id,
          label: found.data?.label || found.label || found.id,
          type: found.type || "default",
        };
      } else {
        selectedNodeContext = { id: selectedNodeId, label: selectedNodeId };
      }
    }

    // Define response schema for structured JSON output with expanded action values
    const responseSchema = {
      type: "object",
      properties: {
        speech_text: {
          type: "string",
          description: "The tutor's spoken explanation/response to the student",
        },
        diagram_update: {
          type: "object",
          description: "Instructions to update the flowchart diagram",
          properties: {
            action: {
              type: "string",
              enum: [
                "add_nodes",
                "add_edges",
                "update_nodes",
                "clear_canvas",
                // legacy aliases retained for backward compatibility
                "create",
                "update",
                "delete",
                "replace",
                "append",
                "none",
              ],
              description: "Action to perform on the diagram. Use add_nodes/add_edges/update_nodes/clear_canvas for React Flow state management.",
            },
            nodes: {
              type: "array",
              description: "Array of nodes for the flowchart. For add_nodes: nodes to add. For update_nodes: nodes to update (highlight). For clear_canvas: empty. Position is OPTIONAL — frontend auto-layouts via dagre; do NOT guess coordinates.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string", description: "Short label for the node (2-4 words)" },
                  icon: {
                    type: "string",
                    enum: [
                      "clipboard", "palette", "code", "bug", "rocket", "wrench",
                      "database", "server", "cloud", "lock", "file", "user",
                      "layers", "cog", "shield", "book", "lightbulb", "network", "cpu", "brain"
                    ],
                    description: "Icon name from allowed list. Pick best semantic match: clipboard=Planning, palette=Design, code=Implementation, bug=Testing, rocket=Deployment, wrench=Maintenance, database=DB, server=API/backend, cloud=DevOps, lock=Security, file=Documentation, user=User, layers=Architecture, cog=Process, shield=Auth, book=Concept, lightbulb=Idea, network=Connection, cpu=Computation, brain=AI/Logic. Fallback to book.",
                  },
                  shape: {
                    type: "string",
                    enum: ["rectangle", "pill", "diamond", "circle"],
                    description: "Visual shape preset: rectangle=default, pill=start/end, diamond=decision, circle=state. Optional.",
                  },
                  highlight: { type: "boolean", description: "If true, frontend highlights node red (e.g. student confused about selected node)" },
                  // Position is deprecated — dagre calculates layout. Include only if you must, otherwise omit.
                  position: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                  data: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                    },
                  },
                },
                required: ["id"],
              },
            },
            edges: {
              type: "array",
              description: "Array of edges connecting nodes. For add_edges: edges to add. For others: optional.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  source: { type: "string" },
                  target: { type: "string" },
                  label: { type: "string" },
                },
                required: ["id", "source", "target"],
              },
            },
          },
          required: ["action", "nodes"],
        },
      },
      required: ["speech_text", "diagram_update"],
    };

    const historyText = windowedHistory.length
      ? windowedHistory.map((h) => `${h.role === "model" ? "AI Tutor" : "Student"}: ${h.text}`).join("\n")
      : "No prior conversation.";

    const selectedNodeText = selectedNodeContext
      ? `Selected node -> id: "${selectedNodeContext.id}", label: "${selectedNodeContext.label}", type: "${selectedNodeContext.type}"`
      : "No node selected.";

    const allowedIcons = ["clipboard","palette","code","bug","rocket","wrench","database","server","cloud","lock","file","user","layers","cog","shield","book","lightbulb","network","cpu","brain"];
    const systemInstruction = `You are Dyna-learn, an interactive AI tutor operating as an asynchronous state generator in a decoupled React + Express architecture.

Context you MUST use:
- CanvasState (ReactFlow current nodes/edges — positions are auto-calculated, ignore x/y): ${JSON.stringify(effectiveCanvas)}
- ${selectedNodeText}
- ChatHistory (sliding window last 6 turns, 3 user + 3 AI): 
${historyText}

Rules:
- Always respond with valid JSON matching the required schema.
- speech_text: a clear, concise, encouraging explanation tailored to the student's current question AND selected node + history for personalization. If a node is selected and the question is about that node's concept, explicitly reference it. If the question is clearly about a DIFFERENT concept (e.g., user asks about Testing but selected is Concept), do NOT highlight the selected node — highlight the relevant node instead or use none.
- diagram_update.action MUST be one of: add_nodes, add_edges, update_nodes, clear_canvas, none. Prefer these 4. Only use legacy values if you must.
  - add_nodes: add new concept nodes to the flowchart. Provide nodes with id, label, icon (MUST be one of: ${allowedIcons.join(",")} — REQUIRED for every node), optional shape (rectangle|pill|diamond|circle). DO NOT provide position — frontend auto-layouts via dagre into a clean grid. Provide edges array to connect them. Example node: {"id":"planning","label":"Planning & Analysis","icon":"clipboard","shape":"rectangle"}. Example edge: {"id":"e1","source":"planning","target":"design","label":"next"}.
  - add_edges: add connections between nodes (provide edges with id, source, target, optional label). Nodes optional.
  - update_nodes: highlight or update an existing node (e.g., if student is confused about selected node, set highlight:true). Provide nodes with id and highlight flag + icon if updating. Use this ONLY when the student's confusion maps to the selected node.
  - clear_canvas: reset the canvas (provide empty nodes/edges).
  - none: no diagram change.
- You may return both nodes and edges in a single update when needed (e.g., add_nodes with edges populated, frontend will append both).
- Keep diagrams simple, incremental, and pedagogically useful. Do not recreate entire canvas unless using clear_canvas. Ideal granularity: 3-7 nodes for an overview, up to 10 for detailed breakdown.
- If the question is unrelated to learning, gently redirect and use action none.
- Personalize using history: do not repeat explanations already given; build upon last 6 turns.
- Icon guidance: clipboard=Planning/Analysis, palette=Design, code=Implementation/Code, bug=Testing/QA, rocket=Deployment/Release, wrench=Maintenance/Support, database=DB/Storage, server=Backend/API, cloud=Cloud/DevOps, lock=Security/Auth, file=Docs/Files, user=User/Actor, layers=Architecture, cog=Process, shield=Protection, book=Concept/Theory, lightbulb=Idea, network=Connection, cpu=Compute, brain=AI/Logic.`;

    // Build contents array from windowed history + current question for Gemini context
    const contents = [];

    // Inject history as alternating user/model turns
    for (const turn of windowedHistory) {
      const role = turn.role === "model" ? "model" : "user";
      contents.push({
        role,
        parts: [{ text: turn.text }],
      });
    }

    // Append current student question with selected node context
    const currentPrompt = selectedNodeContext
      ? `Student clicked node "${selectedNodeContext.id}" (${selectedNodeContext.label}) and asks: ${studentQuestion}`
      : `Student question: ${studentQuestion}`;

    contents.push({
      role: "user",
      parts: [{ text: currentPrompt }],
    });

    // Try primary model, fallback on 404 (new-user restriction on 2.5)
    let response;
    let lastError;
    const candidates = [GEMINI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
    for (const model of candidates) {
      try {
        console.log(`[tutor] attempting model: ${model} | selectedNode: ${selectedNodeId || "none"} | history: ${windowedHistory.length}`);
        response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
          },
        });
        console.log(`[tutor] success with model: ${model}`);
        break;
      } catch (err) {
        lastError = err;
        const msg = err?.message || "";
        const is404 = msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("no longer available");
        console.warn(`[tutor] model ${model} failed: ${msg.slice(0, 200)}`);
        if (!is404) throw err;
        // otherwise continue to next fallback
      }
    }
    if (!response) throw lastError || new Error("All Gemini models failed");

    // Extract text - SDK returns response.text
    let resultText = response.text;

    // Fallback: try candidates
    if (!resultText && response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
      resultText = response.candidates[0].content.parts[0].text;
    }

    if (!resultText) {
      throw new Error("Empty response from Gemini");
    }

    const parsed = JSON.parse(resultText);

    res.json(parsed);
  } catch (error) {
    console.error("Error in /api/tutor:", error);
    const msg = error.message || "";
    let code = "TUTOR_ERROR";
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.includes("quota")) code = "GEMINI_RATE_LIMIT";
    else if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.toLowerCase().includes("high demand")) code = "GEMINI_UNAVAILABLE";
    else if (msg.includes("404") || msg.includes("NOT_FOUND")) code = "GEMINI_MODEL_NOT_FOUND";
    else if (msg.includes("401") || msg.includes("API key")) code = "GEMINI_AUTH_ERROR";
    res.status(code === "GEMINI_RATE_LIMIT" ? 429 : 500).json({
      error: "Failed to generate tutor response",
      details: msg,
      code,
    });
  }
});

// --- Edge TTS self-hosted (in-process, no fetch, same as Toolbox-backend) ---
const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${EDGE_TOKEN}`;

app.get("/api/tts/voices", async (req, res) => {
  try {
    const resp = await fetch(EDGE_VOICE_LIST_URL);
    if (!resp.ok) throw new Error(`voices ${resp.status}`);
    const voices = await resp.json();
    const filtered = voices
      .filter((v) => v.Locale.startsWith("en-") || v.Locale.startsWith("zh-") || v.Locale.startsWith("ja-") || v.Locale.startsWith("ko-"))
      .slice(0, 30)
      .map((v) => ({ id: v.ShortName, label: `${String(v.FriendlyName).replace("Microsoft ", "")} — ${v.Gender} (${v.Locale})`, lang: v.Locale, gender: v.Gender, locale: v.Locale }));
    if (filtered.length) return res.json({ voices: filtered, mode: "edge", count: filtered.length });
    throw new Error("empty");
  } catch (e) {
    console.warn("[tts] getVoices failed, using fallback:", e.message);
    res.json({ voices: EDGE_VOICE_FALLBACK, mode: "edge-fallback", count: EDGE_VOICE_FALLBACK.length });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "en-US-AriaNeural", rate = "+0%", volume = "+0%", pitch = "+0Hz" } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "text required", code: "TTS_TEXT_REQUIRED" });
    const trimmed = text.slice(0, 5000);
    if (trimmed.length !== text.length) console.log(`[tts] truncated ${text.length} -> 5000 chars`);
    console.log(`[tts] synthesize voice=${voice} len=${trimmed.length}`);
    // node-edge-tts writes to file, so create temp file — use async read to avoid blocking event loop
    const tmpPath = path.join(os.tmpdir(), `dyna-tts-${crypto.randomUUID()}.mp3`);
    const ttsEngine = new EdgeTTS({ voice, rate, volume, pitch });
    await ttsEngine.ttsPromise(trimmed, tmpPath);
    const audioBuffer = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-TTS-Voice", voice);
    res.setHeader("Content-Length", audioBuffer.length);
    res.send(audioBuffer);
  } catch (err) {
    console.error("Error in /api/tts:", err);
    const msg = err.message || String(err);
    let code = "TTS_ERROR";
    if (msg.includes("429") || msg.toLowerCase().includes("throttl")) code = "TTS_RATE_LIMIT";
    res.status(500).json({ error: "Edge TTS failed", details: msg.slice(0, 1000), code });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dyna-learn backend running on http://0.0.0.0:${PORT}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`TTS mode: edge-tts self-hosted (in-process, no fetch, same as Toolbox-backend)`);
});
