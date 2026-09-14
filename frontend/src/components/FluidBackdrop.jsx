import { useMemo, lazy, Suspense } from "react";

const SplashCursor = lazy(() => import("./SplashCursor.jsx"));

// Dyna-learn tuned props: cheaper than React Bits defaults (mobile-safe),
// single brand-violet color instead of rainbow, faster fade for readability.
const FLUID_PROPS = {
  SIM_RESOLUTION: 64,
  DYE_RESOLUTION: 768,
  PRESSURE_ITERATIONS: 12,
  CURL: 2,
  SPLAT_RADIUS: 0.15,
  SPLAT_FORCE: 4000,
  DENSITY_DISSIPATION: 4,
  VELOCITY_DISSIPATION: 2.5,
  SHADING: true,
  RAINBOW_MODE: false,
  COLOR: "#7c3aed",
  TRANSPARENT: true,
};

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Gates the fluid effect: no WebGL, reduced motion, or touch pointers => no mount.
export default function FluidBackdrop() {
  const allowed = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    if (window.matchMedia?.("(pointer: coarse)").matches) return false;
    return hasWebGL();
  }, []);

  if (!allowed) return null;

  return (
    <Suspense fallback={null}>
      <SplashCursor {...FLUID_PROPS} />
    </Suspense>
  );
}
