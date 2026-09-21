// Lightweight, Zero-dependency Supabase Client for Dyna-learn
// Uses standard Web Fetch API + PostgREST & Supabase GoTrue Auth

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const AUTH_STORAGE_KEY = "dyna_supabase_auth_session";

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("placeholder") &&
    SUPABASE_URL.startsWith("http")
  );
}

// ── Token Storage Helpers ───────────────────────────────────────────────────
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

// Global subscribers for onAuthStateChange
const authListeners = new Set();
function notifyAuthChange(event, session) {
  authListeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (err) {
      console.error("Auth listener error:", err);
    }
  });
}

// Check for OAuth hash tokens in URL (e.g. #access_token=...&refresh_token=...) on app load
if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
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
      // Clean up hash from URL without page reload
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      // Fetch user profile in background
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

// ── Auth Module ─────────────────────────────────────────────────────────────
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
        if (res.status === 401) {
          // Token expired or invalid
          setStoredSession(null);
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
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password, data }),
      });

      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(json.error_description || json.msg || json.message || "Sign up failed") };
      }

      if (json.access_token) {
        setStoredSession(json);
        notifyAuthChange("SIGNED_IN", json);
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
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(json.error_description || json.msg || json.message || "Invalid login credentials") };
      }

      setStoredSession(json);
      notifyAuthChange("SIGNED_IN", json);
      return { data: json, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  signInWithOAuth({ provider = "google", redirectTo = window.location.origin }) {
    if (!isSupabaseConfigured()) {
      return { error: new Error("Supabase is not configured.") };
    }
    const targetUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.href = targetUrl;
    return { error: null };
  },

  async signOut() {
    const session = getStoredSession();
    if (session?.access_token && isSupabaseConfigured()) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      }).catch(() => {});
    }
    setStoredSession(null);
    notifyAuthChange("SIGNED_OUT", null);
    return { error: null };
  },

  onAuthStateChange(callback) {
    authListeners.add(callback);
    // Emit initial status
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

    const session = getStoredSession();
    if (session?.access_token) {
      this.headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  select(columns = "*") {
    this.method = "GET";
    this.queryParams.set("select", columns);
    return this;
  }

  insert(data) {
    this.method = "POST";
    this.headers.Prefer = "return=representation";
    this.body = JSON.stringify(data);
    return this;
  }

  update(data) {
    this.method = "PATCH";
    this.headers.Prefer = "return=representation";
    this.body = JSON.stringify(data);
    return this;
  }

  delete() {
    this.method = "DELETE";
    this.headers.Prefer = "return=representation";
    return this;
  }

  eq(column, value) {
    this.queryParams.set(column, `eq.${value}`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.queryParams.set("order", `${column}.${ascending ? "asc" : "desc"}`);
    return this;
  }

  limit(count) {
    this.queryParams.set("limit", String(count));
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async then(resolve, _reject) {
    if (!isSupabaseConfigured()) {
      const res = { data: null, error: new Error("Supabase is not configured.") };
      return resolve ? resolve(res) : res;
    }

    try {
      const queryString = this.queryParams.toString();
      const finalUrl = queryString ? `${this.url}?${queryString}` : this.url;

      const response = await fetch(finalUrl, {
        method: this.method,
        headers: this.headers,
        body: this.body,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const err = new Error(errorJson.message || errorJson.error || `HTTP ${response.status}`);
        const result = { data: null, error: err };
        return resolve ? resolve(result) : result;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        const result = { data: null, error: null };
        return resolve ? resolve(result) : result;
      }

      let data = await response.json();
      if (this.isSingle && Array.isArray(data)) {
        data = data[0] || null;
      }

      const result = { data, error: null };
      return resolve ? resolve(result) : result;
    } catch (err) {
      const result = { data: null, error: err };
      return resolve ? resolve(result) : result;
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
