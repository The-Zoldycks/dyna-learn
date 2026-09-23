import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../utils/supabaseClient";
import { toast } from "sonner";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const isConfigured = isSupabaseConfigured();
  const [loading, setLoading] = useState(isConfigured);

  // Load user profile from public.profiles
  const loadProfile = useCallback(async (userId) => {
    if (!userId || !isConfigured) return null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data);
        return data;
      }
    } catch (err) {
      console.warn("Failed to load user profile:", err);
    }
    return null;
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured) return;

    let mounted = true;

    // Check initial user
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const currentUser = data?.user || null;
      setUser(currentUser);
      if (currentUser) loadProfile(currentUser.id);
      setLoading(false);
    });

    // Subscribe to auth state updates
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, [isConfigured, loadProfile]);

  const loginWithGoogle = useCallback(async () => {
    if (!isConfigured) {
      toast.info("Supabase is not configured yet. Operating in Guest Mode.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      redirectTo: window.location.origin,
    });
    if (error) {
      toast.error("Google sign-in failed", { description: error.message });
      throw error;
    }
  }, [isConfigured]);

  const loginWithPassword = useCallback(async (email, password) => {
    if (!isConfigured) {
      toast.info("Supabase is not configured yet. Operating in Guest Mode.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Login failed", { description: error.message });
      throw error;
    }
    toast.success("Welcome back!");
    return data;
  }, [isConfigured]);

  const signUpWithPassword = useCallback(async (email, password, displayName) => {
    if (!isConfigured) {
      toast.info("Supabase is not configured yet. Operating in Guest Mode.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      data: { full_name: displayName || splitEmail(email) },
    });
    if (error) {
      toast.error("Sign up failed", { description: error.message });
      throw error;
    }
    if (!data?.access_token && !data?.session) {
      toast.info("Verification needed", {
        description: "Check your email for the confirmation link, or disable 'Confirm email' in your Supabase dashboard.",
        duration: 8000,
      });
    } else {
      toast.success("Account created successfully!");
    }
    return data;
  }, [isConfigured]);

  const logout = useCallback(async () => {
    if (!isConfigured) return;
    const prevUserId = user?.id;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    try {
      localStorage.removeItem("dyna_active_session_id");
      localStorage.removeItem("dyna-nodes");
      localStorage.removeItem("dyna-edges");
      // Keep chat for guest continuity, remove offline queue for this user
      const raw = localStorage.getItem("dyna_offline_sessions_queue");
      if (raw) {
        const queue = JSON.parse(raw);
        const filtered = prevUserId ? queue.filter((item) => item.userId !== prevUserId) : [];
        if (filtered.length) localStorage.setItem("dyna_offline_sessions_queue", JSON.stringify(filtered));
        else localStorage.removeItem("dyna_offline_sessions_queue");
      }
    } catch {}
    toast.info("Signed out", { description: "Switched to local Guest Mode." });
  }, [isConfigured, user]);

  const requestPasswordReset = useCallback(async (email) => {
    if (!isConfigured) {
      toast.info("Supabase is not configured yet. Cannot send reset email.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, `${window.location.origin}?reset=1`);
    if (error) {
      toast.error("Password reset failed", { description: error.message });
      throw error;
    }
    toast.success("Password reset email sent!", {
      description: "Check your inbox for a link to reset your password.",
      duration: 6000,
    });
  }, [isConfigured]);

  const updatePassword = useCallback(async (newPassword) => {
    if (!isConfigured) {
      toast.info("Supabase is not configured yet.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error("Password update failed", { description: error.message });
      throw error;
    }
    toast.success("Password updated!", { description: "You can now sign in with your new password." });
  }, [isConfigured]);

  // Initials generator for fallback avatar
  const initials = getInitials(profile?.display_name || user?.user_metadata?.full_name || user?.email || "Guest");

  return {
    user,
    profile,
    loading,
    isConfigured,
    initials,
    loginWithGoogle,
    loginWithPassword,
    signUpWithPassword,
    logout,
    requestPasswordReset,
    updatePassword,
    refreshProfile: () => (user ? loadProfile(user.id) : null),
  };
}

function splitEmail(email = "") {
  return email.split("@")[0] || "Learner";
}

function getInitials(name = "Learner") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || "DL").toUpperCase();
}
