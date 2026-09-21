import { useState, useRef, useEffect, useMemo } from "react";
import { X, Sparkles, Mail, Lock, User, Loader2, ArrowRight, Eye, EyeOff, Check } from "lucide-react";

export default function AuthModal({ open, onClose, onLoginWithGoogle, onLoginWithPassword, onSignUpWithPassword }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => modalRef.current?.querySelector("input")?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "bg-slate-200", text: "text-slate-400" };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    switch (score) {
      case 1:
        return { score: 1, label: "Weak", color: "bg-rose-500", text: "text-rose-600" };
      case 2:
        return { score: 2, label: "Fair", color: "bg-amber-500", text: "text-amber-600" };
      case 3:
        return { score: 3, label: "Good", color: "bg-blue-500", text: "text-blue-600" };
      case 4:
        return { score: 4, label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
      default:
        return { score: 0, label: "Too short", color: "bg-rose-400", text: "text-rose-500" };
    }
  }, [password]);

  const rules = useMemo(
    () => [
      { label: "8+ characters", met: password.length >= 8 },
      { label: "Upper & lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
      { label: "Number (0-9)", met: /\d/.test(password) },
      { label: "Symbol (!@#$)", met: /[^A-Za-z0-9]/.test(password) },
    ],
    [password]
  );

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    setErrorMsg("");

    try {
      if (mode === "login") {
        await onLoginWithPassword(email, password);
      } else {
        await onSignUpWithPassword(email, password, name);
      }
      onClose();
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Invalid login credentials")) {
        setErrorMsg("Invalid email or password. If you haven't created an account yet, click 'Create one free' below.");
      } else if (msg.includes("Email not confirmed")) {
        setErrorMsg("Your email is not confirmed yet. Please check your inbox for the link, or turn off 'Confirm email' in Supabase.");
      } else {
        setErrorMsg(msg || "Authentication failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      await onLoginWithGoogle();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to initialize Google login.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-slate-100 bg-gradient-to-br from-violet-50/60 to-indigo-50/30">
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles size={16} />
            </div>
            <h2 id="auth-modal-title" className="text-base font-bold text-slate-900">
              {mode === "login" ? "Welcome back to Dyna-learn" : "Create your Dyna-learn Account"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Sync your mind maps, keep your streak alive, and review flashcards on any device.
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-normal flex items-start gap-2">
              <span className="font-bold">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1-Click Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-sm disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">or with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Turing"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                {mode === "signup" && password && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 ${strength.text}`}>
                    {strength.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <span className="inline-block transition-transform duration-200 hover:scale-110">
                    {showPassword ? (
                      <EyeOff size={14} className="text-violet-600 animate-in fade-in zoom-in-75 duration-150" />
                    ) : (
                      <Eye size={14} className="text-slate-400 hover:text-slate-600 animate-in fade-in zoom-in-75 duration-150" />
                    )}
                  </span>
                </button>
              </div>

              {/* Dynamic Password Strength Monitor (Sign up mode only) */}
              {mode === "signup" && password && (
                <div className="mt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Segmented Strength Bar */}
                  <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-full rounded-full transition-all duration-300 ${
                          strength.score >= level ? strength.color : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Checklist criteria */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1">
                    {rules.map((rule, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 text-[10px] transition-colors duration-200 ${
                          rule.met ? "text-emerald-700 font-medium" : "text-slate-400"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all duration-200 ${
                            rule.met ? "bg-emerald-100 text-emerald-600 font-bold" : "bg-slate-100 text-slate-300"
                          }`}
                        >
                          <Check size={8} strokeWidth={3} />
                        </div>
                        <span className="truncate">{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Sign In" : "Create Account"}
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>

          {/* Toggle Login vs Sign Up */}
          <div className="mt-4 text-center">
            {mode === "login" ? (
              <p className="text-xs text-slate-500">
                Don't have an account yet?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setErrorMsg("");
                    setShowPassword(false);
                  }}
                  className="text-violet-600 font-semibold hover:underline"
                >
                  Create one free
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMsg("");
                    setShowPassword(false);
                  }}
                  className="text-violet-600 font-semibold hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
