"use client";

import { useLayoutEffect } from "react";
import { applyTheme, nextTheme, saveTheme, storedTheme, THEME_STORAGE_KEY } from "@/lib/theme";

const svg = { "aria-hidden": true, viewBox: "0 0 24 24", width: 20, height: 20 } as const;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * Cycles the colour theme: system, light, dark. It renders all three states and globals.css shows
 * the one matching <html>'s data-theme, so the right one shows before React loads.
 */
export function ThemeToggle() {
  useLayoutEffect(() => {
    // Re-applies the stored theme after React's development remount clears <html>'s attributes.
    applyTheme(storedTheme());
    // Follows a change made in another tab.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(storedTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button type="button" className="theme-toggle" onClick={() => saveTheme(nextTheme(storedTheme()))}>
      <span className="theme-system">
        <svg {...svg}>
          <rect x="3" y="4" width="18" height="12" rx="2" {...stroke} />
          <path d="M8 20h8M12 16v4" {...stroke} />
        </svg>
        <span className="sr-only">Theme: system</span>
      </span>
      <span className="theme-light">
        <svg {...svg}>
          <circle cx="12" cy="12" r="4" {...stroke} />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            {...stroke}
          />
        </svg>
        <span className="sr-only">Theme: light</span>
      </span>
      <span className="theme-dark">
        <svg {...svg}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...stroke} />
        </svg>
        <span className="sr-only">Theme: dark</span>
      </span>
    </button>
  );
}
