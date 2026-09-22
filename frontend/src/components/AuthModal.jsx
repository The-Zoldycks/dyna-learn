import { useState, useMemo, useRef, useEffect } from "react";
import {
  X, Sparkles, Mail, Lock, User, Loader2, ArrowRight,
  Eye, EyeOff, Check, AlertTriangle, KeyRound, ChevronLeft,
  SendHorizonal,
} from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

// ── Animated Eye Icon ──────────────────────────────────────────────────────
function EyeToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg
                 text-slate-400 hover:text-violet-600 hover:bg-violet-50
                 transition-colors duration-150 focus:outline-none focus-visible:ring-2
                 focus-visible:ring-violet-500"
      aria-label={visible ? "Hide password" : "Show password"}
      title={visible ? "Hide password" : "Show password"}
      tabIndex={-1}
    >
      <span className="relative flex items-center justify-center w-4 h-4">
        {/* Eye — fades + scales in when password is hidden */}
        <Eye
          size={14}
          className={`absolute transition-all duration-200
            ${visible ? "opacity-0 scale-50" : "opacity-100 scale-100"}`}
        />
        {/* EyeOff — fades + scales in when password is visible */}
        <EyeOff
          size={14}
          className={`absolute text-violet-500 transition-all duration-200
            ${visible ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
        />
      </span>
    </button>
  );
}

// ── Strength segment colours (tailwind bg class) ───────────────────────────
const SEGMENT_COLORS = ["bg-rose-500", "bg-amber-400", "bg-blue-500", "bg-emerald-500"];
const STRENGTH_META = [
  { label: "",          text: "text-slate-400" },
  { label: "Weak",      text: "text-rose-600"    },
  { label: "Fair",      text: "text-amber-600"   },
  { label: "Good",      text: "text-blue-600"    },
  { label: "Strong",    text: "text-emerald-600" },
];

// ── Main Component ─────────────────────────────────────────────────────────
export default function AuthModal({
  open,
  onClose,
  onLoginWithGoogle,
  onLoginWithPassword,
  onSignUpWithPassword,
  onRequestPasswordReset,
}) {
  // "login" | "signup" | "forgot" | "forgot-sent"
  const [mode, setMode] = useState("login");

  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [name,          setName]          = useState("");
  const [loading,       setLoading]       = useState(false);
  const [errorMsg,      setErrorMsg]      = useState("");
  const [resetEmail,    setResetEmail]    = useState("");

  const modalRef = useFocusTrap(open);

  // Reset internal state whenever the modal opens/closes
  useEffect(() => {
    if (!open) {
      setMode("login");
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setName("");
      setLoading(false);
      setErrorMsg("");
      setResetEmail("");
    }
  }, [open]);

  // ── Password strength ────────────────────────────────────────────────────
  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)                                    s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password))       s++;
    if (/\d/.test(password))                                     s++;
    if (/[^A-Za-z0-9]/.test(password))                          s++;
    return s;
  }, [password]);

  const rules = useMemo(() => [
    { label: "8+ characters",    met: password.length >= 8 },
    { label: "Upper & lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number (0-9)",      met: /\d/.test(password) },
    { label: "Symbol (!@#$)",     met: /[^A-Za-z0-9]/.test(password) },
  ], [password]);

  if (!open) return null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setErrorMsg("Please fill in all required fields."); return; }
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
        setErrorMsg("Your email isn't confirmed yet. Check your inbox for the confirmation link.");
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

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!resetEmail) { setErrorMsg("Please enter your email address."); return; }
    setLoading(true);
    setErrorMsg("");
    try {
      await onRequestPasswordReset(resetEmail);
      setMode("forgot-sent");
    } catch (err) {
      setErrorMsg(err.message || "Could not send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => { setMode("login"); setErrorMsg(""); };

  // ── Render ────────────────────────────────────────────────────────────────
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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100
                   animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="relative px-6 pt-6 pb-4 border-b border-slate-100 bg-violet-50/60">
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400
                       hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X size={16} />
          </button>

          {/* Back arrow — shown in forgot screens */}
          {(mode === "forgot" || mode === "forgot-sent") && (
            <button
              onClick={goToLogin}
              className="absolute top-4 left-4 flex items-center gap-1 text-[11px] font-medium
                         text-violet-600 hover:text-violet-800 transition"
            >
              <ChevronLeft size={13} />
              Back
            </button>
          )}

          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-sm">
              {mode === "forgot" || mode === "forgot-sent"
                ? <KeyRound size={16} />
                : <Sparkles size={16} />}
            </div>
            <h2 id="auth-modal-title" className="text-base font-bold text-slate-900">
              {mode === "login"        && "Welcome back to Dyna-learn"}
              {mode === "signup"       && "Create your Dyna-learn Account"}
              {mode === "forgot"       && "Reset your password"}
              {mode === "forgot-sent"  && "Check your inbox"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {(mode === "login" || mode === "signup") &&
              "Sync your mind maps, keep your streak alive, and review flashcards on any device."}
            {mode === "forgot" &&
              "Enter your email and we'll send you a link to create a new password."}
            {mode === "forgot-sent" &&
              `A reset link has been sent to ${resetEmail}. It may take a minute to arrive.`}
          </p>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="p-6">

          {/* Error banner */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700
                            leading-normal flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ══ FORGOT-SENT SUCCESS SCREEN ══════════════════════════════ */}
          {mode === "forgot-sent" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <SendHorizonal size={26} className="text-emerald-600" />
              </div>
              <p className="text-xs text-slate-500 text-center leading-relaxed max-w-xs">
                Didn't receive it? Check your spam folder or{" "}
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setErrorMsg(""); }}
                  className="text-violet-600 font-semibold hover:underline"
                >
                  try again
                </button>.
              </p>
              <button
                onClick={goToLogin}
                className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold
                           shadow-sm transition"
              >
                Back to sign in
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* ══ FORGOT PASSWORD FORM ════════════════════════════════════ */}
          {mode === "forgot" && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50
                               focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold
                           shadow-sm transition disabled:opacity-50"
              >
                {loading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <><SendHorizonal size={13} /> Send reset link</>}
              </button>
            </form>
          )}

          {/* ══ LOGIN / SIGNUP FORMS ════════════════════════════════════ */}
          {(mode === "login" || mode === "signup") && (
            <>
              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl
                           border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold
                           text-slate-700 transition shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">or with email</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name field (sign up only) */}
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
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50
                                   focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                      />
                    </div>
                  </div>
                )}

                {/* Email */}
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
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50
                                 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Password</label>
                    {/* Strength label (sign-up only, when typing) */}
                    {mode === "signup" && password && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider
                                       transition-colors duration-300 ${STRENGTH_META[score].text}`}>
                        {STRENGTH_META[score].label}
                      </span>
                    )}
                    {/* Forgot password link (login only) */}
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => { setMode("forgot"); setResetEmail(email); setErrorMsg(""); }}
                        className="text-[10px] font-semibold text-violet-500 hover:text-violet-700
                                   hover:underline transition"
                      >
                        Forgot password?
                      </button>
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
                      className="w-full pl-9 pr-10 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50
                                 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                    />
                    <EyeToggle visible={showPassword} onToggle={() => setShowPassword((p) => !p)} />
                  </div>

                  {/* ── Dynamic Password Strength (signup + typing) ── */}
                  {mode === "signup" && password && (
                    <div className="mt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">

                      {/* Segmented animated bar */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className="h-1.5 rounded-full overflow-hidden bg-slate-200"
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-400 ease-out
                                ${score >= level ? SEGMENT_COLORS[level - 1] : "w-0"}`}
                              style={{ width: score >= level ? "100%" : "0%" }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Animated rule checklist */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
                        {rules.map((rule, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-1.5 text-[10px] transition-colors duration-300
                              ${rule.met ? "text-emerald-700 font-medium" : "text-slate-400"}`}
                          >
                            {/* Checkmark circle — scales in when rule is met */}
                            <span
                              className={`flex items-center justify-center w-3.5 h-3.5 rounded-full
                                         transition-all duration-250 ease-out
                                         ${rule.met
                                           ? "bg-emerald-500 scale-110"
                                           : "bg-slate-200 scale-90"}`}
                            >
                              <Check
                                size={8}
                                strokeWidth={3}
                                className={`transition-all duration-200
                                  ${rule.met ? "text-white opacity-100" : "text-slate-300 opacity-60"}`}
                              />
                            </span>
                            <span className="truncate">{rule.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl
                             bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold
                             shadow-sm transition disabled:opacity-50"
                >
                  {loading
                    ? <Loader2 size={14} className="animate-spin" />
                    : <>{mode === "login" ? "Sign In" : "Create Account"}<ArrowRight size={13} /></>}
                </button>
              </form>

              {/* Toggle login ↔ signup */}
              <div className="mt-4 text-center">
                {mode === "login" ? (
                  <p className="text-xs text-slate-500">
                    Don't have an account yet?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setErrorMsg(""); setShowPassword(false); }}
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
                      onClick={() => { setMode("login"); setErrorMsg(""); setShowPassword(false); }}
                      className="text-violet-600 font-semibold hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
