/**
 * The colour theme. "system" follows the device's setting; "light" and "dark" pin it by setting
 * `data-theme` on <html>, which globals.css reads. The choice is kept in this browser only.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const ORDER: Theme[] = ["system", "light", "dark"];

/** The theme the theme button moves to next: system, then light, then dark, then back. */
export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
}

/** The stored theme. Anything else, or storage that can't be read, means "system". */
export function storedTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Stores the theme, if storage can be written, and applies it to the page. */
export function saveTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies to this page; it just won't be remembered.
  }
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Run in <head> before the page paints, so a stored theme never flashes the system one first.
 * Mirrors storedTheme() and applyTheme().
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
