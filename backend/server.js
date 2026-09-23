import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

dotenv.config();

// Startup validation — fail fast if required secrets missing
if (!process.env.GEMINI_API_KEY) {
  console.error("FATAL: GEMINI_API_KEY not set. Set it in environment or backend/.env");
  process.exit(1);
}

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
// Last known-good model — tried first to skip the fallback chain on warm paths
let workingModel = null;
let workingModelExpiresAt = 0;
const WORKING_MODEL_TTL_MS = 10 * 60 * 1000;

// Monthly budget guard — estimated spend, resets on calendar-month boundary.
// Persisted to disk so restarts don't reset the counter.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const BUDGET_STATE_PATH = path.join(os.tmpdir(), "dyna-budget.json");
let monthlySpendUSD = 0;
let monthlySpendMonth = new Date().toISOString().slice(0, 7);
try {
  if (existsSync(BUDGET_STATE_PATH)) {
    const saved = JSON.parse(readFileSync(BUDGET_STATE_PATH, "utf8"));
    if (saved?.month === monthlySpendMonth) monthlySpendUSD = Number(saved.spend) || 0;
  }
} catch {}
function persistBudget() {
  try {
    writeFileSync(BUDGET_STATE_PATH, JSON.stringify({ month: monthlySpendMonth, spend: monthlySpendUSD }));
  } catch {}
}
function estimateTutorCostUSD(inputChars, outputChars) {
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  return (inputTokens / 1e6) * 0.25 + (outputTokens / 1e6) * 1.5;
}
function checkBudgetOrThrow() {
  const cap = parseFloat(process.env.GEMINI_MONTHLY_CAP_USD || "");
  if (!cap || Number.isNaN(cap)) return;
  // Reset on calendar month boundary
  const month = new Date().toISOString().slice(0, 7);
  if (month !== monthlySpendMonth) {
    monthlySpendMonth = month;
    monthlySpendUSD = 0;
    persistBudget();
  }
  if (monthlySpendUSD >= cap) {
    const err = new Error("Monthly budget exhausted");
    err.code = "BUDGET_EXHAUSTED";
    throw err;
  }
}
function recordSpend(usd) {
  monthlySpendUSD += usd;
  persistBudget();
}

// Guest daily cap (in-memory, per-IP)
const guestDailyCounts = new Map(); // ip -> { count, day }
function checkGuestDailyCap(req) {
  const auth = req.headers.authorization || "";
  const isGuest = !auth.startsWith("Bearer ") || auth.length < 20;
  if (!isGuest) return;
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const entry = guestDailyCounts.get(ip);
  if (!entry || entry.day !== day) {
    guestDailyCounts.set(ip, { count: 1, day });
    return;
  }
  entry.count += 1;
  const GUEST_DAILY_LIMIT = 40;
  if (entry.count > GUEST_DAILY_LIMIT) {
    const err = new Error("Guest daily limit exceeded — sign in for higher limits");
    err.code = "GUEST_DAILY_LIMIT";
    err.status = 429;
    throw err;
  }
}

// TTS concurrency guard
let ttsActive = 0;
const TTS_MAX_CONCURRENT = 3;

function truncateLabel(s, n = 200) {
  return typeof s === "string" && s.length > n ? s.slice(0, n) : s;
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // we serve inline styles via Vite in dev
  crossOriginEmbedderPolicy: false,
}));
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.disable('x-powered-by');

// Middleware — allowlist (prod URLs + Vercel preview deploys + localhost)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://dyna-learn.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Vercel preview regex: dyna-learn-<hash>.vercel.app
const VERCEL_PREVIEW_REGEX = /^https:\/\/dyna-learn-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin) {
  if (!origin) return true; // Server-to-server, curl, or same-origin
  if (allowedOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "dyna-learn.vercel.app" || VERCEL_PREVIEW_REGEX.test(origin)) {
      return true;
    }
  } catch {}
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'), false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
}));

// Behind Render's proxy — without this, express-rate-limit counts the proxy IP as one user
app.set('trust proxy', 1);

// Per-IP rate limiting — mounted BEFORE express.json so throttled clients
// are rejected without paying the cost of parsing up to 8mb of JSON
const tutorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many tutor requests — wait a minute and retry.", code: "TUTOR_RATE_LIMIT" },
});
const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { error: "Too many TTS requests — wait a minute and retry.", code: "TTS_RATE_LIMIT" },
});
app.use("/api/tutor", tutorLimiter);
app.use("/api/tts", ttsLimiter);

app.use(express.json({ limit: '8mb' }));

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/healthz", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
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
      image = null,
    } = req.body;

    if (!studentQuestion || typeof studentQuestion !== "string" || !studentQuestion.trim()) {
      return res.status(400).json({ error: "studentQuestion is required", code: "VALIDATION_ERROR" });
    }
    // Support both legacy flowchartState and new canvasState (monorepo contract)
    const rawCanvas = canvasState || flowchartState || { nodes: [], edges: [] };
    // Input caps — bound context size and per-request cost before touching the model
    const cappedQuestion = studentQuestion.slice(0, 4000);
    const cappedHistory = (Array.isArray(chatHistory) ? chatHistory : []).slice(-20);
    const effectiveCanvas = {
      nodes: (rawCanvas.nodes || []).slice(0, 200),
      edges: (rawCanvas.edges || []).slice(0, 500),
    };

    // Cap canvas to the most-recent 30 nodes before injecting into the system prompt.
    // Large canvases (100+ nodes) can exhaust context tokens silently; pruning keeps
    // the model focused and within safe limits. The full canvas is still used for
    // selectedNodeId resolution below.
    const CANVAS_NODE_LIMIT = 30;
    const CANVAS_EDGE_LIMIT = 100;
    const canvasForPrompt = {
      nodes: (effectiveCanvas.nodes || []).slice(-CANVAS_NODE_LIMIT).map((n) => ({
        ...n,
        id: truncateLabel(n.id, 100),
        label: truncateLabel(n.label || n.data?.label, 200),
        data: n.data ? { ...n.data, label: truncateLabel(n.data.label, 200) } : n.data,
      })),
      edges: (effectiveCanvas.edges || []).slice(-CANVAS_EDGE_LIMIT).map((e) => ({
        ...e,
        id: truncateLabel(e.id, 100),
        source: truncateLabel(e.source, 100),
        target: truncateLabel(e.target, 100),
        label: truncateLabel(e.label, 200),
      })),
    };
    if ((effectiveCanvas.nodes || []).length > CANVAS_NODE_LIMIT) {
      console.warn(`[tutor] canvas truncated ${effectiveCanvas.nodes.length} → ${CANVAS_NODE_LIMIT} nodes for prompt`);
    }

    // Budget and guest guards
    try {
      checkBudgetOrThrow();
      checkGuestDailyCap(req);
    } catch (guardErr) {
      const code = guardErr.code || "TUTOR_ERROR";
      const status = guardErr.status || (code === "BUDGET_EXHAUSTED" ? 503 : 429);
      return res.status(status).json({ error: guardErr.message, code });
    }

    // Sliding window: retain last 6 conversation turns (3 user prompts + 3 AI responses)
    // chatHistory expected as array of {role: "user"|"model", text: string} or {role, content}
    const normalizedHistory = cappedHistory.map((entry) => ({
      role: entry.role === "model" || entry.role === "assistant" ? "model" : "user",
      text: String(entry.text || entry.content || entry.message || "").slice(0, 2000),
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
        quiz: {
          type: "object",
          description: "A 3-question active recall test. Present only when action is 'quiz'.",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string", description: "The multiple-choice question text." },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of exactly 4 possible answers."
                  },
                  correct_index: { type: "integer", description: "0-based index of the correct option." },
                  explanation: { type: "string", description: "Why the correct answer is right and others are wrong." }
                },
                required: ["question", "options", "correct_index", "explanation"]
              }
            }
          },
          required: ["questions"]
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
                "quiz",
                // legacy aliases retained for backward compatibility
                "create",
                "update",
                "delete",
                "replace",
                "append",
                "none",
              ],
              description: "Action to perform. Use quiz when the user asks to be tested. Use add_nodes/update_nodes/none for standard diagram management.",
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

    const selectedNodeText = selectedNodeContext
      ? `Selected node -> id: "${selectedNodeContext.id}", label: "${selectedNodeContext.label}", type: "${selectedNodeContext.type}"`
      : "No node selected.";

    const allowedIcons = ["clipboard","palette","code","bug","rocket","wrench","database","server","cloud","lock","file","user","layers","cog","shield","book","lightbulb","network","cpu","brain"];
    const systemInstruction = `You are Dyna-learn, an interactive AI tutor operating as an asynchronous state generator in a decoupled React + Express architecture.

Context you MUST use:
- CanvasState (ReactFlow current nodes/edges — positions are auto-calculated, ignore x/y): ${JSON.stringify(canvasForPrompt)}
- ${selectedNodeText}
- ChatHistory: the last ${windowedHistory.length} conversation turns are provided as native conversation history alongside this instruction — use them for personalization instead of repeating explanations.

Rules:
- Always respond with valid JSON matching the required schema.
- speech_text: Provide a highly detailed, comprehensive, and pedagogical explanation. Structure your response using markdown with clear section headers (## or ###), bullet points, code snippets (\`\`\`lang) when illustrating code/syntax, and blockquotes (> Note) for key takeaways so the explanation is clear and deep.
- diagram_update.action MUST be one of: add_nodes, add_edges, update_nodes, clear_canvas, quiz, none.
  - quiz: use this ONLY when the student explicitly asks to be tested or quizzed. Provide exactly 3 multiple-choice questions in the root "quiz" object. speech_text should introduce the quiz.
  - add_nodes: construct rich, highly detailed architectural and conceptual flowcharts. When breaking down complex systems, use 8-15 nodes to illustrate complete lifecycles, data flows, and sub-components. **CRITICAL: If a node is selected, YOU MUST branch out from that selected node by adding edges that connect the selected node's ID to your new nodes.** If no node is selected, connect new nodes logically to existing nodes on the canvas where relevant so the diagram grows as a connected graph. Provide nodes with id, label, icon (MUST be one of: ${allowedIcons.join(",")}). DO NOT provide position. Provide edges array to connect them logically.
  - add_edges: add connections between nodes (provide edges with id, source, target, optional label).
  - update_nodes: highlight or update an existing node (e.g., if student is confused about selected node, set highlight:true).
  - clear_canvas: reset the canvas (provide empty nodes/edges).
  - none: no diagram change.
- For follow-up questions, ALWAYS prefer "add_nodes" to continuously expand and branch out the diagram, making it a growing, adaptive mind map. Do not keep the diagram static.
- Icon guidance: clipboard=Planning, palette=Design, code=Code, bug=Testing, rocket=Deploy, wrench=Maintenance, database=DB, server=Backend, cloud=Cloud, lock=Security, file=Docs, user=User, layers=Architecture, cog=Process, shield=Protection, book=Concept, network=Connection, brain=AI.
- If the user provides an image or screenshot, analyze it carefully to answer their question, translate it into the diagram canvas if requested, and directly address the visual contents in your speech_text.`;

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
    const currentPromptText = selectedNodeContext
      ? `Student clicked node "${selectedNodeContext.id}" (${selectedNodeContext.label}) and asks: ${cappedQuestion}`
      : `Student question: ${cappedQuestion}`;

    const currentParts = [{ text: currentPromptText }];

    // Inject Multimodal image if provided — allowlist mime types, cap base64 size (7MB base64 ~ 5MB binary)
    const IMAGE_ALLOWLIST = ["image/png", "image/jpeg", "image/webp"];
    if (image && (image.base64 || image.mimeType) && !(image.base64 && image.mimeType)) {
      return res.status(400).json({ error: "Incomplete image payload (base64 + mimeType required)", code: "VALIDATION_ERROR" });
    }
    if (image && image.base64 && image.mimeType) {
      if (!IMAGE_ALLOWLIST.includes(image.mimeType)) {
        return res.status(400).json({ error: "Unsupported image type (png/jpeg/webp only)", code: "VALIDATION_ERROR" });
      }
      if (image.base64.length > 7 * 1024 * 1024) {
        return res.status(400).json({ error: "Image too large (5MB binary max)", code: "VALIDATION_ERROR" });
      }
      currentParts.push({
        inlineData: {
          data: image.base64,
          mimeType: image.mimeType,
        },
      });
    }

    contents.push({
      role: "user",
      parts: currentParts,
    });

    // Expire stale pinned model
    if (workingModel && Date.now() > workingModelExpiresAt) {
      console.log(`[tutor] workingModel ${workingModel} expired, clearing pin`);
      workingModel = null;
      workingModelExpiresAt = 0;
    }
    let response;
    let lastError;
    const ordered = workingModel && workingModel !== GEMINI_MODEL
      ? [workingModel, GEMINI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL && m !== workingModel)]
      : [GEMINI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
    const candidates = [...new Set(ordered)];

    let overallTimer = null;
    const overallTimeout = new Promise((_, reject) => {
      overallTimer = setTimeout(() => reject(Object.assign(new Error("Tutor request timed out after 25s"), { code: "TUTOR_TIMEOUT" })), 25000);
    });
    const runFallback = async () => {
      for (let i = 0; i < candidates.length; i++) {
        const model = candidates[i];
        try {
          console.log(`[tutor] attempting model: ${model} | selectedNode: ${selectedNodeId || "none"} | history: ${windowedHistory.length}`);
          response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema,
              httpOptions: { timeout: 20000 },
            },
          });
          console.log(`[tutor] success with model: ${model}`);
          workingModel = model;
          workingModelExpiresAt = Date.now() + WORKING_MODEL_TTL_MS;
          return;
        } catch (err) {
          lastError = err;
          const msg = err?.message || "";
          const status = err?.status ?? err?.code ?? err?.response?.status;
          const is404 = status === 404 || msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("no longer available") || msg.includes("MODEL_NOT_FOUND");
          const isRateLimit = status === 429 || msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource_exhausted");
          const isUnavailable = status === 503 || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.toLowerCase().includes("high demand");
          console.warn(`[tutor] model ${model} failed: ${msg.slice(0, 200)}`);
          if (is404 || isRateLimit || isUnavailable) {
            if (isRateLimit || isUnavailable) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
            continue;
          }
          throw err;
        }
      }
    };
    try {
      await Promise.race([runFallback(), overallTimeout]);
    } catch (e) {
      if (!response) throw e;
    } finally {
      if (overallTimer) clearTimeout(overallTimer);
    }
    if (!response) throw lastError || new Error("All Gemini models failed");
    try {
      const outChars = (response.text || "").length;
      const inChars = JSON.stringify(contents).length + systemInstruction.length;
      recordSpend(estimateTutorCostUSD(inChars, outChars));
    } catch {}

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
    if (!parsed || typeof parsed !== "object" || (!parsed.speech_text && !parsed.quiz)) {
      throw Object.assign(new Error("Model returned an empty shape"), { code: "JSON_SHAPE_ERROR" });
    }

    res.json(parsed);
  } catch (error) {
    console.error("Error in /api/tutor:", error);
    const msg = error.message || "";
    let code = error.code || "TUTOR_ERROR";
    if (code === "TUTOR_ERROR") {
      if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.includes("quota")) code = "GEMINI_RATE_LIMIT";
      else if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.toLowerCase().includes("high demand")) code = "GEMINI_UNAVAILABLE";
      else if (msg.includes("404") || msg.includes("NOT_FOUND")) code = "GEMINI_MODEL_NOT_FOUND";
      else if (msg.includes("401") || msg.includes("API key")) code = "GEMINI_AUTH_ERROR";
    }
    const isProd = process.env.NODE_ENV === "production";
    let status = 500;
    if (code === "GEMINI_RATE_LIMIT" || code === "GUEST_DAILY_LIMIT" || code === "TUTOR_RATE_LIMIT") status = 429;
    else if (code === "BUDGET_EXHAUSTED" || code === "TUTOR_TIMEOUT" || code === "GEMINI_UNAVAILABLE") status = 503;
    else if (code === "GEMINI_MODEL_NOT_FOUND") status = 404;
    res.status(status).json({
      error: code === "BUDGET_EXHAUSTED" ? "Monthly budget exhausted — try again next month" : code === "GUEST_DAILY_LIMIT" ? error.message : "Failed to generate tutor response",
      ...(isProd ? {} : { details: msg.slice(0, 500) }),
      code,
    });
  }
});

// --- Edge TTS self-hosted (in-process, no fetch, same as Toolbox-backend) ---
// Public Bing client token — overridable via env so rotation doesn't need a code change
const EDGE_TOKEN = process.env.EDGE_TOKEN || "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${EDGE_TOKEN}`;

// Fallback voices when Bing is unreachable — prevents ReferenceError on voices endpoint
const EDGE_VOICE_FALLBACK = [
  { id: "en-US-AriaNeural", label: "Aria — Female (en-US)", lang: "en-US", gender: "Female", locale: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy — Male (en-US)", lang: "en-US", gender: "Male", locale: "en-US" },
  { id: "en-GB-SoniaNeural", label: "Sonia — Female (en-GB)", lang: "en-GB", gender: "Female", locale: "en-GB" },
  { id: "en-GB-RyanNeural", label: "Ryan — Male (en-GB)", lang: "en-GB", gender: "Male", locale: "en-GB" },
  { id: "en-US-JennyNeural", label: "Jenny — Female (en-US)", lang: "en-US", gender: "Female", locale: "en-US" },
];

// In-memory voices cache (1h TTL) — avoids hitting Bing on every page load.
// Failures are negatively cached for 5min so a Bing outage doesn't thundering-herd.
let voicesCache = { at: 0, voices: null };
let voicesFailureAt = 0;
const VOICES_TTL_MS = 60 * 60 * 1000;
const VOICES_FAILURE_TTL_MS = 5 * 60 * 1000;

app.get("/api/tts/voices", async (req, res) => {
  try {
    if (voicesCache.voices && Date.now() - voicesCache.at < VOICES_TTL_MS) {
      return res.json({ voices: voicesCache.voices, mode: "edge", count: voicesCache.voices.length, cached: true });
    }
    if (voicesFailureAt && Date.now() - voicesFailureAt < VOICES_FAILURE_TTL_MS) {
      return res.json({ voices: EDGE_VOICE_FALLBACK, mode: "edge-fallback", count: EDGE_VOICE_FALLBACK.length, cached: true });
    }
    const resp = await fetch(EDGE_VOICE_LIST_URL, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`voices ${resp.status}`);
    const voices = await resp.json();
    const filtered = voices
      .filter((v) => v.Locale.startsWith("en-") || v.Locale.startsWith("zh-") || v.Locale.startsWith("ja-") || v.Locale.startsWith("ko-"))
      .slice(0, 30)
      .map((v) => ({ id: v.ShortName, label: `${String(v.FriendlyName).replace("Microsoft ", "")} — ${v.Gender} (${v.Locale})`, lang: v.Locale, gender: v.Gender, locale: v.Locale }));
    if (filtered.length) {
      voicesCache = { at: Date.now(), voices: filtered };
      return res.json({ voices: filtered, mode: "edge", count: filtered.length });
    }
    throw new Error("empty");
  } catch (e) {
    console.warn("[tts] getVoices failed, using fallback:", e.message);
    voicesFailureAt = Date.now();
    res.json({ voices: EDGE_VOICE_FALLBACK, mode: "edge-fallback", count: EDGE_VOICE_FALLBACK.length });
  }
});

app.post("/api/tts", async (req, res) => {
  let tmpPath = null;
  let incremented = false;
  let ttsSettled = false;
  const markSettled = () => { ttsSettled = true; };
  try {
    if (ttsActive >= TTS_MAX_CONCURRENT) {
      return res.status(429).json({ error: "Too many concurrent TTS requests — try again shortly", code: "TTS_CONCURRENCY_LIMIT" });
    }
    const { text, voice = "en-US-AriaNeural", rate = "+0%", volume = "+0%", pitch = "+0Hz" } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "text required", code: "TTS_TEXT_REQUIRED" });

    // Validate voice format: en-US-AriaNeural pattern
    const VOICE_RE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/;
    if (!VOICE_RE.test(voice)) return res.status(400).json({ error: "invalid voice", code: "TTS_VOICE_INVALID" });

    // Validate rate/volume/pitch ranges (backend clamps match SSML limits)
    const RATE_RE = /^[+-](\d{1,3})%$/;
    if (!RATE_RE.test(rate)) return res.status(400).json({ error: "invalid rate format (e.g. +10%, -20%)", code: "TTS_RATE_INVALID" });
    const rateVal = parseInt(rate.slice(0, -1), 10);
    if (rateVal > 100 || rateVal < -50) return res.status(400).json({ error: "rate out of range [-50%, +100%]", code: "TTS_RATE_INVALID" });

    const VOLUME_RE = /^[+-]\d{1,3}%$/;
    if (!VOLUME_RE.test(volume)) return res.status(400).json({ error: "invalid volume format", code: "TTS_VOLUME_INVALID" });
    const volumeVal = parseInt(volume.slice(0, -1), 10);
    if (volumeVal > 100 || volumeVal < -50) return res.status(400).json({ error: "volume out of range [-50%, +100%]", code: "TTS_VOLUME_INVALID" });

    const PITCH_RE = /^[+-]\d+Hz$/;
    if (!PITCH_RE.test(pitch)) return res.status(400).json({ error: "invalid pitch format (e.g. +5Hz)", code: "TTS_PITCH_INVALID" });
    const pitchVal = parseInt(pitch.slice(0, -2), 10);
    if (pitchVal > 50 || pitchVal < -50) return res.status(400).json({ error: "pitch out of range [-50Hz, +50Hz]", code: "TTS_PITCH_INVALID" });

    // Occupy a synthesis slot only after validation passes
    ttsActive++; incremented = true;
    const trimmed = text.slice(0, 5000);
    if (trimmed.length !== text.length) console.log(`[tts] truncated ${text.length} -> 5000 chars`);
    console.log(`[tts] synthesize voice=${voice} rate=${rate} volume=${volume} pitch=${pitch} len=${trimmed.length}`);
    // node-edge-tts writes to file, so create temp file — use async read to avoid blocking event loop
    tmpPath = path.join(os.tmpdir(), `dyna-tts-${crypto.randomUUID()}.mp3`);
    const ttsEngine = new EdgeTTS({ voice, rate, volume, pitch });
    // 15s timeout on synthesis — wait for the loser to settle before unlinking
    // so a zombie synthesis can't race the file delete.
    const synth = ttsEngine.ttsPromise(trimmed, tmpPath).then(markSettled, markSettled);
    await Promise.race([
      synth,
      new Promise((_, reject) => setTimeout(() => reject(new Error("TTS timeout")), 15000)),
    ]);
    // If we timed out, wait for the zombie to finish writing before reading/unlinking
    if (!ttsSettled) {
      try {
        await Promise.race([synth, new Promise((r) => setTimeout(r, 5000))]);
      } catch {}
    }
    const audioBuffer = await fs.readFile(tmpPath);
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
    else if (msg.toLowerCase().includes("concurrency")) code = "TTS_CONCURRENCY_LIMIT";
    const isProd = process.env.NODE_ENV === "production";
    const status = code === "TTS_RATE_LIMIT" || code === "TTS_CONCURRENCY_LIMIT" ? 429 : 500;
    if (!res.headersSent) res.status(status).json({ error: "Edge TTS failed", ...(isProd ? {} : { details: msg.slice(0, 1000) }), code });
  } finally {
    if (incremented) ttsActive = Math.max(0, ttsActive - 1);
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
});

// Centralized JSON error handler — prevents HTML leaks for CORS/parse errors.
// NOTE: conventional order is 404-handler first, then this error handler;
// Express only invokes 4-arg middleware via next(err), so normal 404s below
// correctly skip this block either way.
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ error: "Malformed JSON body", code: "BAD_JSON" });
  }
  if (err?.message === "CORS not allowed") {
    return res.status(403).json({ error: "Origin not allowed", code: "CORS_FORBIDDEN" });
  }
  console.error("[error-middleware]", err);
  const isProd = process.env.NODE_ENV === "production";
  res.status(err?.status || 500).json({
    error: "Internal server error",
    ...(isProd ? {} : { details: err?.message?.slice(0, 500) }),
    code: "INTERNAL_ERROR",
  });
});

// JSON 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dyna-learn backend running on http://0.0.0.0:${PORT}`);
  console.log(`TTS mode: edge-tts self-hosted (in-process, no fetch, same as Toolbox-backend)`);
});

// Graceful shutdown — Render sends SIGTERM, 30s grace
function shutdown(signal) {
  console.log(`${signal} received, closing HTTP server...`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  // Force close after 25s (leaving 5s buffer for Render's 30s limit)
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 25000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// Crash fast on unknown state — Render restarts the service cleanly
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection — exiting:", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception — exiting:", err);
  process.exit(1);
});
