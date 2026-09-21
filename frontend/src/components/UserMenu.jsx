import { useState, useRef, useEffect } from "react";
import { LogIn, LogOut, Flame, FolderKanban, ChevronDown } from "lucide-react";

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

  if (!user) {
    return (
      <button
        onClick={onOpenAuth}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200/80 transition shadow-sm"
        title="Sign in to sync your study notes across devices"
      >
        <LogIn size={13} />
        <span>Sign in</span>
      </button>
    );
  }

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;
  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Learner";
  const streakCount = profile?.streak || 1;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 transition shadow-sm"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        aria-label="User account menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-slate-200" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
            {initials}
          </div>
        )}
        <span className="hidden sm:inline max-w-[100px] truncate">{displayName}</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md w-fit border border-amber-200/60">
              <Flame size={12} /> {streakCount} day streak
            </div>
          </div>

          <div className="p-1">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onOpenSessions();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition text-left"
            >
              <FolderKanban size={14} className="text-violet-600" />
              My Study Sessions
            </button>
          </div>

          <div className="p-1 border-t border-slate-100">
            <button
              onClick={() => {
                setDropdownOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition text-left"
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
