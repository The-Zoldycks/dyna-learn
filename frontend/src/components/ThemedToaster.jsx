import { Toaster } from "sonner";
import { useTheme } from "../theme.js";

// Sonner ships its own light/dark stylesheets; without this the toasts stayed
// white while the rest of the app was dark.
export default function ThemedToaster() {
  const [theme] = useTheme();
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      expand={false}
      theme={theme}
      toastOptions={{ duration: 3500 }}
      style={{ zIndex: 120 }}
    />
  );
}