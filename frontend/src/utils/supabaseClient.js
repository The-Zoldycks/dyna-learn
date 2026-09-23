// Lightweight, Zero-dependency Supabase Client for Dyna-learn
// Uses standard Web Fetch API + PostgREST & Supabase GoTrue Auth
// Supports PKCE OAuth flow, auto token refresh, proper Promise interface

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const AUTH_STORAGE_KEY = "dyna_supabase_auth_session";
const PKCE_VERIFIER_KEY = "dyna_pkce_code_verifier";

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("placeholder") &&
    SUPABASE_URL.startsWith("http")
  );
}

// ── Token Storage Helpers ───────────────────────────────────────────────────
// Current access token for backend calls (activates the signed-in tier;
// absence means the guest daily cap applies).
export function getAccessToken() {
  try {
    return getStoredSession()?.access_token || null;
  } catch {
    return null;
  }
}
function getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredSession(session) {
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {}
}

function getPkceVerifier() {
  try {
    return localStorage.getItem(PKCE_VERIFIER_KEY);
  } catch { return null; }
}

function setPkceVerifier(verifier) {
  try {
    if (verifier) localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    else localStorage.removeItem(PKCE_VERIFIER_KEY);
  } catch {}
}

// Global subscribers for onAuthStateChange
const authListeners = new Set();
function notifyAuthChange(event, session) {
  authListeners.forEach((listener) => {
    try { listener(event, session); } catch (err) { console.error("Auth listener error:", err); }
  });
}

// Schedule token refresh before expiry
let refreshTimer = null;
let refreshInFlight = null;
function scheduleTokenRefresh(session) {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!session?.expires_at) return;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = session.expires_at - now;
  if (expiresIn <= 60) {
    // Already expired or expiring very soon, refresh immediately
    refreshAccessToken(session.refresh_token);
    return;
  }
  // Refresh 30 seconds before expiry
  const delayMs = (expiresIn - 30) * 1000;
  refreshTimer = setTimeout(() => refreshAccessToken(session.refresh_token), delayMs);
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken || !isSupabaseConfigured()) return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error_description || body.msg || `Refresh failed: ${res.status}`;
        const isInvalidGrant = res.status === 400 && /invalid_grant/i.test(msg);
        const err = new Error(msg);
        err.status = res.status;
        err.isInvalidGrant = isInvalidGrant;
        throw err;
      }
      const json = await res.json();
      const newSession = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
        user: json.user,
      };
      setStoredSession(newSession);
      scheduleTokenRefresh(newSession);
      notifyAuthChange("TOKEN_REFRESHED", newSession);
    } catch (err) {
      if (err.isInvalidGrant || err.status === 401) {
        console.warn("Token refresh failed — invalid grant, signing out:", err);
        setStoredSession(null);
        notifyAuthChange("SIGNED_OUT", null);
      } else {
        console.warn("Token refresh failed (transient):", err);
      }
      throw err;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Check for OAuth hash tokens (legacy implicit flow) on app load
if (typeof window !== "undefined") {
  const hash = window.location.hash;
  if (hash.includes("access_token=")) {
    try {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const expiresIn = parseInt(hashParams.get("expires_in") || "3600", 10);
      if (accessToken) {
        const initialSession = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        };
        setStoredSession(initialSession);
        scheduleTokenRefresh(initialSession);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setTimeout(() => {
          auth.getUser().then(({ data }) => {
            if (data?.user) {
              initialSession.user = data.user;
              setStoredSession(initialSession);
              notifyAuthChange("SIGNED_IN", initialSession);
            }
          });
        }, 0);
      }
    } catch (err) {
      console.warn("Failed to parse OAuth callback hash:", err);
    }
  }
  // Check for PKCE code exchange (modern flow: ?code=...)
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get("code");
  if (code) {
    const verifier = getPkceVerifier();
    if (verifier) {
      exchangePkceCode(code, verifier);
    } else {
      // Code without a verifier (recovery link, second tab, cleared storage):
      // don't leave a dead ?code= in the URL.
      window.history.replaceState(null, "", window.location.pathname);
      console.warn("Auth code present without PKCE verifier — restart sign-in.");
    }
  }
}

// Exchange an OAuth/recovery code for a session (verifier-less recovery links
// still fail closed here; the reset modal handles password recovery separately).
async function exchangePkceCode(code, verifier) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    if (!res.ok) throw new Error(`PKCE exchange failed: ${res.status}`);
    const json = await res.json();
    const session = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
      user: json.user,
    };
    setStoredSession(session);
    scheduleTokenRefresh(session);
    setPkceVerifier(null);
    window.history.replaceState(null, "", window.location.pathname);
    notifyAuthChange("SIGNED_IN", session);
  } catch (err) {
    console.error("PKCE code exchange failed:", err);
    setPkceVerifier(null);
  }
}

// Cross-tab auth sync
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === AUTH_STORAGE_KEY) {
      try {
        const session = e.newValue ? JSON.parse(e.newValue) : null;
        if (session?.access_token) {
          scheduleTokenRefresh(session);
          notifyAuthChange("SIGNED_IN", session);
        } else {
          if (refreshTimer) clearTimeout(refreshTimer);
          // Drop cloud-session pointers so this tab can't re-save to the old account
          try {
            localStorage.removeItem("dyna_active_session_id");
            localStorage.removeItem("dyna-nodes");
            localStorage.removeItem("dyna-edges");
          } catch {}
          notifyAuthChange("SIGNED_OUT", null);
        }
      } catch {}
    }
  });
}

// ── Auth Module ─────────────────────────────────────────────────────────────
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const auth = {
  getSession() {
    const s = getStoredSession();
    return { data: { session: s }, error: null };
  },

  async getUser() {
    if (!isSupabaseConfigured()) return { data: { user: null }, error: null };
    const session = getStoredSession();
    if (!session?.access_token) return { data: { user: null }, error: null };

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401 && session.refresh_token) {
          try {
            await refreshAccessToken(session.refresh_token);
          } catch {}
          const newSession = getStoredSession();
          if (newSession?.access_token) {
            const retry = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${newSession.access_token}`,
              },
            });
            if (retry.ok) {
              const user = await retry.json();
              return { data: { user }, error: null };
            }
          }
        }
        // Only clear session if it was already invalidated by refresh (invalid_grant)
        if (!getStoredSession()) {
          notifyAuthChange("SIGNED_OUT", null);
        }
        return { data: { user: null }, error: new Error(`HTTP ${res.status}`) };
      }

      const user = await res.json();
      return { data: { user }, error: null };
    } catch (err) {
      return { data: { user: null }, error: err };
    }
  },

  async signUp({ email, password, data = {} }) {
    if (!isSupabaseConfigured()) {
      return { data: null, error: new Error("Supabase is not configured.") };
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password, data }),
      });
      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(json.error_description || json.msg || json.message || "Sign up failed") };
      }
      if (json.access_token) {
        const session = {
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
          user: json.user,
        };
        setStoredSession(session);
        scheduleTokenRefresh(session);
        notifyAuthChange("SIGNED_IN", session);
      }
      return { data: json, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async signInWithPassword({ email, password }) {
    if (!isSupabaseConfigured()) {
      return { data: null, error: new Error("Supabase is not configured.") };
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(json.error_description || json.msg || json.message || "Invalid login credentials") };
      }
      const session = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
        user: json.user,
      };
      setStoredSession(session);
      scheduleTokenRefresh(session);
      notifyAuthChange("SIGNED_IN", session);
      return { data: json, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async signInWithOAuth({ provider = "google", redirectTo = window.location.origin }) {
    if (!isSupabaseConfigured()) {
      return { error: new Error("Supabase is not configured.") };
    }
    const verifier = generateCodeVerifier();
    setPkceVerifier(verifier);
    let challenge = verifier;
    let method = "plain";
    try {
      const data = new TextEncoder().encode(verifier);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const hashArray = new Uint8Array(hash);
      challenge = btoa(String.fromCharCode(...hashArray)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      method = "S256";
    } catch {}
    const targetUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=${method}`;
    window.location.href = targetUrl;
    return { error: null };
  },

  async signOut() {
    const session = getStoredSession();
    if (session?.access_token && isSupabaseConfigured()) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
      }).catch((err) => console.warn("Server logout failed (local session cleared anyway):", err.message));
    }
    if (refreshTimer) clearTimeout(refreshTimer);
    setStoredSession(null);
    setPkceVerifier(null);
    notifyAuthChange("SIGNED_OUT", null);
    return { error: null };
  },

  async resetPasswordForEmail(email, redirectTo = window.location.origin) {
    if (!isSupabaseConfigured()) {
      return { error: new Error("Supabase is not configured.") };
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, gotrue_meta_security: {}, redirect_to: redirectTo }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        return { error: new Error(json.error_description || json.msg || json.message || "Failed to send reset email") };
      }
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  },

  async updateUser({ password }) {
    if (!isSupabaseConfigured()) return { error: new Error("Supabase is not configured.") };
    const session = getStoredSession();
    if (!session?.access_token) return { error: new Error("No active session — please use the reset link again.") };
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: new Error(json.error_description || json.msg || json.message || "Failed to update password") };
      return { error: null, data: json };
    } catch (err) {
      return { error: err };
    }
  },

  onAuthStateChange(callback) {
    authListeners.add(callback);
    const currentSession = getStoredSession();
    if (currentSession) {
      callback("INITIAL_SESSION", currentSession);
    }
    return {
      data: {
        subscription: {
          unsubscribe: () => authListeners.delete(callback),
        },
      },
    };
  },
};

// ── Database Query Builder (PostgREST) ──────────────────────────────────────
class QueryBuilder {
constructor(table) {
    this.table = table;
    this.url = `${SUPABASE_URL}/rest/v1/${table}`;
    this.queryParams = new URLSearchParams();
    this.method = "GET";
    this.headers = {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    this.body = null;
    this.isSingle = false;
    this.returning = false;
    this._promise = null; // memoized execute promise
    this._retried = false;

    const session = getStoredSession();
    if (session?.access_token) {
      this.headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  select(columns = "*") {
    this._promise = null; // invalidate memo on query change
    this.method = "GET";
    this.queryParams.set("select", columns);
    return this;
  }

  insert(data) {
    this._promise = null;
    this.method = "POST";
    this.headers.Prefer = "return=representation";
    this.body = JSON.stringify(data);
    this.returning = true;
    return this;
  }

  update(data) {
    this._promise = null;
    this.method = "PATCH";
    this.headers.Prefer = "return=representation";
    this.body = JSON.stringify(data);
    return this;
  }

  delete() {
    this._promise = null;
    this.method = "DELETE";
    this.headers.Prefer = "return=representation";
    return this;
  }

  eq(column, value) {
    this._promise = null;
    this.queryParams.set(column, `eq.${value}`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this._promise = null;
    this.queryParams.set("order", `${column}.${ascending ? "asc" : "desc"}`);
    return this;
  }

  limit(count) {
    this._promise = null;
    this.queryParams.set("limit", String(count));
    return this;
  }

  single() {
    this._promise = null;
    this.isSingle = true;
    return this;
  }

  // Proper Promise interface — memoized so chaining doesn't re-fetch
  then(onFulfilled, onRejected) {
    return this._getPromise().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this._getPromise().catch(onRejected);
  }

  finally(onFinally) {
    return this._getPromise().finally(onFinally);
  }

  _getPromise() {
    if (!this._promise) {
      this._promise = this.execute();
    }
    return this._promise;
  }

  async execute() {
    if (!isSupabaseConfigured()) {
      return { data: null, error: new Error("Supabase is not configured.") };
    }

    try {
      let finalUrl = this.url;
      const queryString = this.queryParams.toString();
      if (queryString) finalUrl += `?${queryString}`;

      // For insert, ensure we request the id back
      if (this.returning && this.method === "POST") {
        const sep = finalUrl.includes("?") ? "&" : "?";
        finalUrl += `${sep}select=id`;
      }

      let response = await fetch(finalUrl, {
        method: this.method,
        headers: this.headers,
        body: this.body,
      });

      // 401 retry once after refresh (covers expired access token during cloud saves)
      if (response.status === 401 && !this._retried) {
        const session = getStoredSession();
        if (session?.refresh_token) {
          try {
            await refreshAccessToken(session.refresh_token);
            const newSession = getStoredSession();
            if (newSession?.access_token) {
              this.headers.Authorization = `Bearer ${newSession.access_token}`;
              this._retried = true;
              response = await fetch(finalUrl, {
                method: this.method,
                headers: this.headers,
                body: this.body,
              });
            }
          } catch {}
        }
      }

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const err = new Error(errorJson.message || errorJson.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.details = errorJson;
        return { data: null, error: err };
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { data: null, error: null };
      }

      let data = await response.json();
      if (this.isSingle && Array.isArray(data)) {
        data = data[0] || null;
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

export function from(table) {
  return new QueryBuilder(table);
}

export const supabase = {
  auth,
  from,
  isConfigured: isSupabaseConfigured,
};