import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Regression guard for the password-recovery flow.
//
// Bug: `resetPasswordForEmail` posted no PKCE challenge, so on return the
// client found no verifier, discarded the recovery code, and App.jsx opened
// the reset modal anyway. `updateUser` then PUT the new password under
// whatever session was in localStorage — on a device already signed in, that
// silently changed a *different* account's password. On a signed-out device it
// errored with "No active session". Either way the modal reported success
// for the wrong account.

const store = new Map();
const sessionStorageMock = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = sessionStorageMock;

// A stubbed global fetch records what went to GoTrue.
const calls = [];
function routeFetch(url, opts = {}) {
  const path = String(url);
  calls.push({ path, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  const ok = (json) =>
    Promise.resolve({ ok: true, status: 200, json: async () => json });
  const bad = (msg) =>
    Promise.resolve({ ok: false, status: 400, json: async () => ({ msg }) });

  if (path.includes("/auth/v1/recover")) {
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (body.code_challenge) return ok({});
    return bad("missing code_challenge");
  }
  if (path.includes("/auth/v1/token") && opts.method === "POST") {
    const body = opts.body ? JSON.parse(opts.body) : {};
    const isPkce = String(url).includes("grant_type=pkce");
    // A recovery code is only exchangeable when a verifier was presented.
    if (isPkce && body.code_verifier) {
      return ok({
        access_token: "recovery-token",
        refresh_token: "recovery-refresh",
        expires_in: 3600,
        user: { id: "user-from-email", email: "owner@example.com" },
      });
    }
    if (isPkce) return bad("invalid code_verifier");
    return ok({ access_token: "t", refresh_token: "r", expires_in: 3600, user: {} });
  }
  if (path.endsWith("/auth/v1/user") && opts.method === "PUT") {
    const bearer = (opts.headers?.Authorization || "").replace("Bearer ", "");
    // GoTrue only lets the session that matches the account change the password.
    if (bearer !== "recovery-token") return bad("session belongs to another account");
    return ok({ id: "user-from-email" });
  }
  if (path.endsWith("/auth/v1/user")) return ok({ id: "user-from-email", email: "owner@example.com" });
  return ok({});
}
globalThis.fetch = vi.fn(routeFetch);

// Deterministic verifier/challenge so the exchange can be correlated.
vi.stubGlobal("crypto", {
  getRandomValues: (arr) => arr.fill(7),
  subtle: {
    // Note: the real algorithm identifier is "SHA-256". An earlier revision of
    // the client used "S-256", which throws here and silently broke every
    // password reset — the email sent with a challenge nobody could exchange.
    digest: async (alg, data) => {
      if (alg !== "SHA-256") throw new Error(`Unrecognized name: ${alg}`);
      const s = new TextDecoder().decode(data);
      return new TextEncoder().encode(`challenge-of:${s}`);
    },
  },
});
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

async function loadClient(url) {
  if (typeof window !== "undefined") {
    delete window.location;
    window.location = new URL(url);
    window.history = { replaceState: () => {} };
  } else {
    globalThis.window = { location: new URL(url), history: { replaceState: () => {} }, addEventListener() {} };
  }
  vi.resetModules();
  return import("./supabaseClient");
}

// The module reads window.location at import time, so the test drives it there.
const URL_BASE = "https://dyna-learn.example";

async function freshClient(search) {
  store.clear();
  calls.length = 0;
  const mod = await loadClient(`${URL_BASE}/${search}`);
  // Let any queued microtasks from the link handling settle.
  await new Promise((r) => setTimeout(r, 0));
  return mod;
}

describe("password recovery", () => {
  beforeEach(() => {
    if (typeof window === "undefined") globalThis.window = { location: new URL(`${URL_BASE}/`), addEventListener() {} };
    store.clear();
    calls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("binds the reset email to a PKCE challenge", async () => {
    const mod = await freshClient("");
    const { error } = await mod.auth.resetPasswordForEmail("owner@example.com", `${URL_BASE}/?reset=1`);
    expect(error).toBeNull();

    const recoverCall = calls.find((c) => c.path.includes("/auth/v1/recover"));
    expect(recoverCall, "no /recover request was made").toBeTruthy();
    expect(recoverCall.body.code_challenge).toBeTruthy();
    expect(recoverCall.body.code_challenge_method).toBe("S256");
    // The verifier must be kept so the emailed code can be exchanged later.
    expect(store.get("dyna_pkce_code_verifier")).toBeTruthy();
  });

  it("still sends recoverable emails when crypto.subtle is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr) => arr.fill(7),
      // Non-secure contexts have no SubtleCrypto at all.
      subtle: undefined,
    });
    const mod = await freshClient("");
    const { error } = await mod.auth.resetPasswordForEmail("owner@example.com", `${URL_BASE}/?reset=1`);
    expect(error).toBeNull();
    const recoverCall = calls.find((c) => c.path.includes("/auth/v1/recover"));
    expect(recoverCall.body.code_challenge).toBeTruthy();
    // Falls back to plain, which still binds the code to the local verifier.
    expect(recoverCall.body.code_challenge_method).toBe("plain");
    expect(store.get("dyna_pkce_code_verifier")).toBeTruthy();
  });

  it("exchanges a valid recovery code and establishes the email account's session", async () => {
    // The browser that requested the link still holds the verifier.
    store.set("dyna_pkce_code_verifier", "VERIFIER-OK");
    const mod = await loadClient(`${URL_BASE}/?code=abc123&reset=1`);
    const result = await mod.recoveryLinkResult;
    expect(result).toEqual({ wasRecoveryLink: true, ok: true });
    expect(mod.isRecoveryPending()).toBe(true);
    // The stored session must be the one from the email, not a pre-existing one.
    const session = JSON.parse(store.get("dyna_supabase_auth_session"));
    expect(session.user.id).toBe("user-from-email");
    // And the one-shot verifier is consumed.
    expect(store.get("dyna_pkce_code_verifier")).toBeUndefined();
  });

  it("rejects a recovery code that cannot be exchanged", async () => {
    // No verifier stored: the link was opened in a browser that never asked.
    const mod = await loadClient(`${URL_BASE}/?code=abc123&reset=1`);
    const result = await mod.recoveryLinkResult;
    expect(result).toEqual({ wasRecoveryLink: true, ok: false });
    expect(mod.isRecoveryPending()).toBe(false);
  });

  it("updateUser refuses when there is no recovery session", async () => {
    const mod = await loadClient(`${URL_BASE}/`);
    const { error } = await mod.auth.updateUser({ password: "NewPassword1!" });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/expired/i);

    // And nothing was sent to /user.
    const put = calls.find((c) => c.method === "PUT");
    expect(put).toBeUndefined();
  });

  it("updateUser cannot change a password for a session that isn't the recovered one", async () => {
    const mod = await loadClient(`${URL_BASE}/`);
    // Simulate an already-signed-in (different) account.
    store.set(
      "dyna_supabase_auth_session",
      JSON.stringify({ access_token: "someone-elses-token", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600 })
    );
    // Even if the gate flag were set, GoTrue must reject the wrong bearer.
    store.set("dyna_password_recovery_pending", "1");
    const { error } = await mod.auth.updateUser({ password: "NewPassword1!" });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/another account/i);
  });

  it("a normal page load never reports itself as a recovery link", async () => {
    const mod = await loadClient(`${URL_BASE}/`);
    expect(mod.recoveryLinkDetected).toBe(false);
    expect(await mod.recoveryLinkResult).toEqual({ wasRecoveryLink: false, ok: false });
    expect(mod.isRecoveryPending()).toBe(false);
  });

  it("records recoveryLinkDetected at import, before the URL is rewritten", async () => {
    // StrictMode runs the detection effect twice; the flag must survive the
    // query being stripped by the first pass, or the modal never opens.
    const mod = await loadClient(`${URL_BASE}/?reset=1&code=abc123`);
    expect(mod.recoveryLinkDetected).toBe(true);
    const result = await mod.recoveryLinkResult;
    expect(result).toEqual({ wasRecoveryLink: true, ok: false });
    // Still flagged after the link handling finished.
    expect(mod.recoveryLinkDetected).toBe(true);
  });
});
