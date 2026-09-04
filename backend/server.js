import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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
              description: "Array of nodes for the flowchart. For add_nodes: nodes to add. For update_nodes: nodes to update (highlight). For clear_canvas: empty or omitted.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  type: { type: "string", description: "Node type e.g. input, default, output" },
                  highlight: { type: "boolean", description: "If true, frontend should highlight node (e.g. red if student confused)" },
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

    const systemInstruction = `You are Dyna-learn, an interactive AI tutor operating as an asynchronous state generator in a decoupled React + Express architecture.

Context you MUST use:
- CanvasState (ReactFlow current nodes/edges): ${JSON.stringify(effectiveCanvas)}
- ${selectedNodeText}
- ChatHistory (sliding window last 6 turns, 3 user + 3 AI): 
${historyText}

Rules:
- Always respond with valid JSON matching the required schema.
- speech_text: a clear, concise, encouraging explanation tailored to the student's current question AND selected node + history for personalization. If a node is selected, explicitly reference it.
- diagram_update.action MUST be one of: add_nodes, add_edges, update_nodes, clear_canvas, none. Prefer these 4. Only use legacy values if you must.
  - add_nodes: add new concept nodes to the flowchart (provide nodes with id, label, position).
  - add_edges: add connections between nodes (provide edges with id, source, target, optional label).
  - update_nodes: highlight or update an existing node (e.g., if student is confused about selected node, set highlight:true to turn it red). Provide nodes with id and highlight flag.
  - clear_canvas: reset the canvas (provide empty nodes/edges).
  - none: no diagram change.
- You may return both nodes and edges in a single update when needed (e.g., add_nodes + add_edges together in one action; use add_nodes with edges populated, frontend will append both).
- Keep diagrams simple, incremental, and pedagogically useful. Do not recreate entire canvas unless using clear_canvas.
- If the question is unrelated to learning, gently redirect and use action none.
- Personalize using history: do not repeat explanations already given; build upon last 6 turns.`;

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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

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
    res.status(500).json({
      error: "Failed to generate tutor response",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Dyna-learn backend running on http://localhost:${PORT}`);
  console.log(`CORS enabled for: ${FRONTEND_URL}`);
});
