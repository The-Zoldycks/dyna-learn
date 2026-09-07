import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

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

// TTS — Qwen3 hybrid (no-budget: browser fallback if DashScope key missing)
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const DASHSCOPE_TTS_URL = process.env.DASHSCOPE_TTS_URL || "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_VOICES = [
  { id: "Vivian", label: "Vivian — Bright young female (CN)", lang: "Chinese" },
  { id: "Serena", label: "Serena — Warm gentle female (CN)", lang: "Chinese" },
  { id: "Uncle_Fu", label: "Uncle Fu — Mellow male (CN)", lang: "Chinese" },
  { id: "Dylan", label: "Dylan — Beijing male (CN-Beijing)", lang: "Chinese" },
  { id: "Eric", label: "Eric — Chengdu male (CN-Sichuan)", lang: "Chinese" },
  { id: "Ryan", label: "Ryan — Dynamic male (EN)", lang: "English" },
  { id: "Aiden", label: "Aiden — Sunny American male (EN)", lang: "English" },
  { id: "Ono_Anna", label: "Ono Anna — Playful Japanese female", lang: "Japanese" },
  { id: "Sohee", label: "Sohee — Warm Korean female", lang: "Korean" },
];

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
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

// --- Qwen3-TTS proxy (hybrid: DashScope when key present, else 503 fallback to browser) ---
app.get("/api/tts/voices", (req, res) => {
  res.json({ voices: QWEN_VOICES, mode: DASHSCOPE_API_KEY ? "qwen" : "browser-fallback", note: DASHSCOPE_API_KEY ? "DashScope key present" : "No DASHSCOPE_API_KEY — frontend will use browser SpeechSynthesis (no budget)" });
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "Ryan", language = "English", rate = "+0%", instruct } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "text required", code: "TTS_TEXT_REQUIRED" });
    const trimmed = text.slice(0, 5000);
    if (!DASHSCOPE_API_KEY) {
      return res.status(503).json({ error: "TTS not configured — no budget: use browser fallback", code: "TTS_NO_KEY", fallback: "browser", voices: QWEN_VOICES });
    }
    // DashScope Qwen3-TTS realtime proxy — streams audio/mpeg back
    // Docs: https://www.alibabacloud.com/help/en/model-studio/qwen-tts-realtime
    const dashRes = await fetch(DASHSCOPE_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
        "X-DashScope-OssResourceResolve": "enable",
      },
      body: JSON.stringify({
        model: "qwen3-tts-flash",
        input: { text: trimmed, voice, language, rate, instruct },
        parameters: { format: "mp3" },
      }),
    });
    if (!dashRes.ok) {
      const errText = await dashRes.text();
      console.warn(`[tts] DashScope ${dashRes.status}: ${errText.slice(0, 400)}`);
      return res.status(dashRes.status).json({ error: "DashScope TTS failed", details: errText.slice(0, 1000), code: dashRes.status === 429 ? "TTS_RATE_LIMIT" : "TTS_DASHSCOPE_ERROR" });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-TTS-Voice", voice);
    if (dashRes.body && dashRes.body.pipe) {
      dashRes.body.pipe(res);
    } else {
      const buf = Buffer.from(await dashRes.arrayBuffer());
      res.send(buf);
    }
  } catch (err) {
    console.error("Error in /api/tts:", err);
    res.status(500).json({ error: "TTS proxy failed", details: err.message, code: "TTS_PROXY_ERROR" });
  }
});

app.listen(PORT, () => {
  console.log(`Dyna-learn backend running on http://localhost:${PORT}`);
  console.log(`CORS enabled for: ${FRONTEND_URL}`);
  console.log(`TTS mode: ${DASHSCOPE_API_KEY ? "Qwen DashScope (voices selectable)" : "browser fallback (no DASHSCOPE_API_KEY — set to enable Qwen)"}`);
});
