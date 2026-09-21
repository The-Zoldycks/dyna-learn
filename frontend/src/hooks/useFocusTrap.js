import { useEffect, useRef } from "react";

export function useFocusTrap(enabled = true) {
  const containerRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    previousActiveElement.current = document.activeElement;

    const focusableSelectors = [
      'button:not([disabled]):not([aria-hidden="true"])',
      '[href]:not([aria-hidden="true"])',
      'input:not([disabled]):not([aria-hidden="true"])',
      'select:not([disabled]):not([aria-hidden="true"])',
      'textarea:not([disabled]):not([aria-hidden="true"])',
      '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
      '[contenteditable="true"]:not([aria-hidden="true"])',
    ].join(", ");

    const focusableElements = container.querySelectorAll(focusableSelectors);
    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    firstFocusable.focus();

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [enabled]);

  return containerRef;
}