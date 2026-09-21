// Single source of truth for design tokens — one intentional accent, no gradients
export const tokens = {
  colors: {
    accent: '#7c3aed',           // violet-600
    accentHover: '#6d28d9',      // violet-700
    accentLight: '#ede9fe',      // violet-50
    accentBorder: '#c4b5fd',     // violet-300
    confusion: '#fb7185',        // rose-400
    confusionBg: '#fff1f2',      // rose-50
    confusionBorder: '#fda4af',  // rose-300
    warning: '#f59e0b',          // amber-500
    warningBg: '#fffbeb',        // amber-50
    warningBorder: '#fcd34d',    // amber-300
    success: '#22c55e',          // green-500
    successBg: '#f0fdf4',        // green-50
    surface: '#ffffff',
    surfaceHover: '#f8fafc',     // slate-50
    surfacePressed: '#f1f5f9',   // slate-100
    border: '#e2e8f0',           // slate-200
    borderFocus: '#7c3aed',      // accent
    textPrimary: '#1e293b',      // slate-800
    textSecondary: '#64748b',    // slate-500
    textMuted: '#94a3b8',        // slate-400
    textOnAccent: '#ffffff',
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    full: '9999px',
    panel: '24px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
  spacing: (n) => `${n * 4}px`,
  transitions: {
    fast: '150ms ease',
    normal: '200ms ease',
    slow: '300ms ease',
  },
  zIndex: {
    base: 0,
    canvas: 1,
    dropdown: 10,
    header: 20,
    modal: 100,
    toast: 120,
  },
};

// CSS custom properties for use in index.css (only valid CSS values)
export const cssVars = `
  :root {
    --color-accent: ${tokens.colors.accent};
    --color-accent-hover: ${tokens.colors.accentHover};
    --color-accent-light: ${tokens.colors.accentLight};
    --color-accent-border: ${tokens.colors.accentBorder};
    --color-confusion: ${tokens.colors.confusion};
    --color-confusion-bg: ${tokens.colors.confusionBg};
    --color-confusion-border: ${tokens.colors.confusionBorder};
    --color-warning: ${tokens.colors.warning};
    --color-warning-bg: ${tokens.colors.warningBg};
    --color-warning-border: ${tokens.colors.warningBorder};
    --color-success: ${tokens.colors.success};
    --color-success-bg: ${tokens.colors.successBg};
    --radius-sm: ${tokens.radii.sm};
    --radius-md: ${tokens.radii.md};
    --radius-lg: ${tokens.radii.lg};
    --radius-xl: ${tokens.radii.xl};
    --radius-2xl: ${tokens.radii['2xl']};
    --radius-full: ${tokens.radii.full};
    --radius-panel: ${tokens.radii.panel};
    --shadow-sm: ${tokens.shadows.sm};
    --shadow-md: ${tokens.shadows.md};
    --shadow-lg: ${tokens.shadows.lg};
    --shadow-xl: ${tokens.shadows.xl};
    --z-base: ${tokens.zIndex.base};
    --z-canvas: ${tokens.zIndex.canvas};
    --z-dropdown: ${tokens.zIndex.dropdown};
    --z-header: ${tokens.zIndex.header};
    --z-modal: ${tokens.zIndex.modal};
    --z-toast: ${tokens.zIndex.toast};
  }
`;