import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 34579;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

async function waitForBoot(timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error("server did not boot in time");
    await new Promise((r) => setTimeout(r, 250));
  }
}

before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(PORT),
      GEMINI_API_KEY: "test-dummy-key",
      FRONTEND_URL: "http://localhost:5173",
    },
    stdio: "ignore",
  });
  await waitForBoot();
});

after(() => {
  child?.kill("SIGTERM");
});

describe("health", () => {
  it("GET / returns 200 JSON status", async () => {
    const res = await fetch(`${BASE}/`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.status, /Dyna-learn backend running/);
  });
});

describe("CORS", () => {
  it("preflight from allowed origin includes ACAO header", async () => {
    const res = await fetch(`${BASE}/api/tutor`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://dyna-learn.vercel.app",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://dyna-learn.vercel.app");
  });

  it("blocks disallowed origin without ACAO header", async () => {
    const res = await fetch(`${BASE}/api/tts/voices`, {
      headers: { Origin: "http://evil.example.com" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});

describe("validation", () => {
  it("POST /api/tutor without studentQuestion returns 400 VALIDATION_ERROR", async () => {
    const res = await fetch(`${BASE}/api/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasState: { nodes: [], edges: [] } }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "VALIDATION_ERROR");
  });

  it("POST /api/tts without text returns 400 TTS_TEXT_REQUIRED", async () => {
    const res = await fetch(`${BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "TTS_TEXT_REQUIRED");
  });
});

describe("voices", () => {
  it("GET /api/tts/voices returns a non-empty voice list", async () => {
    const res = await fetch(`${BASE}/api/tts/voices`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.voices));
    assert.ok(body.voices.length > 0);
  }, { timeout: 30000 });
});

describe("rate limiting", () => {
  it("responses carry draft-7 RateLimit headers", async () => {
    const res = await fetch(`${BASE}/api/tts/voices`);
    assert.ok(res.headers.get("ratelimit")?.includes("limit="));
  });
});

describe("routing", () => {
  it("unknown routes return 404", async () => {
    const res = await fetch(`${BASE}/no-such-route-xyz`);
    assert.equal(res.status, 404);
  });
});
