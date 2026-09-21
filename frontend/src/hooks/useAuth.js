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
    const { error } = supabase.auth.signInWithOAuth({
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
    toast.success("Account created successfully!");
    return data;
  }, [isConfigured]);

  const logout = useCallback(async () => {
    if (!isConfigured) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    toast.info("Signed out", { description: "Switched to local Guest Mode." });
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
