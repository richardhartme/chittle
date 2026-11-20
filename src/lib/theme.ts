/**
 * The colour theme. Light is the default: no stored choice and no `data-theme` on <html>. "dark"
 * and "system" (which follows the device's setting) set `data-theme`, which globals.css reads. The
 * choice is kept in this browser only.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const ORDER: Theme[] = ["light", "dark", "system"];

/** The theme the theme button moves to next: light, then dark, then system, then back. */
export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
}

/** The stored theme. Anything else, or storage that can't be read, means the default, "light". */
export function storedTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
}

/** Stores the theme, if storage can be written, and applies it to the page. */
export function saveTheme(theme: Theme) {
  try {
    if (theme === "light") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies to this page; it just won't be remembered.
  }
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Run in <head> before the page paints, so a stored theme never flashes the light one first.
 * Mirrors storedTheme() and applyTheme().
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="system")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
