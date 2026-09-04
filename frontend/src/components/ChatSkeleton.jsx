// Chat-only skeleton — pulsing bubble, keeps canvas fluid for pan/zoom during LLM compute
export default function ChatSkeleton() {
  return (
    <div className="rounded-xl bg-slate-100 border border-slate-200 p-3 mr-2 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3 w-10 bg-slate-200 rounded" />
        <div className="ml-auto h-3 w-8 bg-slate-200 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-200 rounded" />
        <div className="h-3 w-5/6 bg-slate-200 rounded" />
        <div className="h-3 w-2/3 bg-slate-200 rounded" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-20 bg-slate-200 rounded-full" />
        <div className="h-6 w-16 bg-slate-200 rounded-full" />
      </div>
    </div>
  );
}
