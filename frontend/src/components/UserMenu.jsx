import { useState, useRef, useEffect } from "react";
import { LogIn, LogOut, Flame, FolderKanban, ChevronDown } from "lucide-react";
import { getStreak } from "../utils/storage.js";

export default function UserMenu({ user, profile, initials, onOpenAuth, onOpenSessions, onLogout }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Single source of truth: local streak engine (same as Journal). Re-read on open.
  // Hooks must run unconditionally — before the guest early-return below.
  const [streakCount, setStreakCount] = useState(() => getStreak());
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (dropdownOpen) {
      try { setStreakCount(getStreak()); } catch {}
    }
  }, [dropdownOpen]);

  if (!user) {
    return (
      <button
        onClick={onOpenAuth}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-soft hover:brightness-105 text-accent-text text-xs font-semibold transition min-h-[44px]"
        title="Sign in to sync your study notes across devices"
      >
        <LogIn size={13} />
        <span>Sign in</span>
      </button>
    );
  }

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;
  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Learner";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="neu-press flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl text-xs font-semibold text-fg min-h-[44px]"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        aria-label="User account menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-line" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-accent text-accent-fg text-[10px] font-bold flex items-center justify-center">
            {initials}
          </div>
        )}
        <span className="hidden sm:inline max-w-[100px] truncate">{displayName}</span>
        <ChevronDown size={12} className={`text-fg-subtle transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface border border-line shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-2 border-b border-line">
            <p className="text-xs font-bold text-fg truncate">{displayName}</p>
            <p className="text-[11px] text-fg-subtle truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-warn-fg bg-warn-soft px-2 py-0.5 rounded-md w-fit border border-warn-line">
              <Flame size={12} /> {streakCount} day streak
            </div>
          </div>

          <div className="p-1">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onOpenSessions();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-fg-muted hover:bg-surface-hover rounded-xl transition text-left min-h-[44px]"
            >
              <FolderKanban size={14} className="text-accent-text" />
              My Study Sessions
            </button>
          </div>

          <div className="p-1 border-t border-line">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-danger-fg hover:bg-danger-soft rounded-xl transition text-left min-h-[44px]"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
