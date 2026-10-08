import React from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    try {
      sessionStorage.clear();
      // Canvas graph persists in localStorage too — clear both stores
      // or a corrupt graph reloads and crashes again. Chat/SRS/offline
      // queue go too so no poisoned state survives the reset.
      ["dyna-nodes", "dyna-edges", "dyna-chat", "dyna-srs", "dyna_offline_sessions_queue"].forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
    } catch {}
    window.location.href = window.location.pathname;
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-surface-2 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-surface border border-line rounded-2xl shadow-xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-danger-soft text-danger-fg rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg">Something went wrong</h2>
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                An unexpected rendering error occurred. You can reload the page or reset the canvas to restore the workspace.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-surface-3 rounded-xl text-left font-mono text-[11px] text-fg max-h-24 overflow-y-auto break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:brightness-110 transition shadow-sm"
              >
                <RefreshCw size={14} /> Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-surface border border-line text-fg text-xs font-semibold hover:bg-surface-2 transition"
              >
                <Trash2 size={14} /> Reset Canvas
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
