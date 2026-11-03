export type ThemeMode = "system" | "dark" | "light";

export const THEMES: ThemeMode[] = ["system", "dark", "light"];
// Wheel order, matching app.css: OKLCH L 0.55 / C 0.155, hue step 40°.
export const ACCENTS = ["red", "orange", "amber", "green", "teal", "cyan", "blue", "violet", "pink"] as const;

export type Accent = (typeof ACCENTS)[number];

/** Apply UI theme and accent preset to a document (<html data-theme data-accent>). */
export function applyTheme(theme: string, accent: string): void {
  const root = document.documentElement;

  if (theme === "dark" || theme === "light") {
    root.dataset.theme = theme;
  } else {
    // "system" and anything unknown: follow the OS preference.
    delete root.dataset.theme;
  }

  root.dataset.accent = ACCENTS.includes(accent as Accent) ? accent : "blue";
}

/**
 * Apply the window material state to a document (<html data-backdrop>).
 *
 * "mica" lets the system material show through the transparent window, so the
 * app paints translucent layers on top of it. Without the attribute the layers
 * are solid, which is what an older Windows (or a browser) gets.
 */
export function applyBackdrop(active: boolean): void {
  const root = document.documentElement;

  if (active) {
    root.dataset.backdrop = "mica";
  } else {
    delete root.dataset.backdrop;
  }
}
