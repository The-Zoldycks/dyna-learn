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
    } catch {}
    window.location.href = window.location.pathname;
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Something went wrong</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                An unexpected rendering error occurred. You can reload the page or reset the canvas to restore the workspace.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-100 rounded-xl text-left font-mono text-[11px] text-slate-700 max-h-24 overflow-y-auto break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition shadow-sm"
              >
                <RefreshCw size={14} /> Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
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
