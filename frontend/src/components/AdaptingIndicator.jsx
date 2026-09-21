export default function AdaptingIndicator({ size = 20, label = "Adapting" }) {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span className="text-xs font-semibold text-violet-700">{label}</span>
      <img
        src="/mahoraga-wheel.png"
        alt=""
        aria-hidden="true"
        className="mahoraga-wheel aspect-square object-contain shrink-0"
        style={{ width: size, height: size }}
      />
    </div>
  );
}