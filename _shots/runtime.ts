/**
 * Which screen the harness is currently rendering, read from the query string
 * by the capture driver: `/_shots/index.html?scene=matrix&lang=ru`.
 */

import { LANGUAGES } from "./geometry.mjs";

export const SCENES = ["list", "completed", "matrix", "editor", "settings", "empty"] as const;
export type Scene = (typeof SCENES)[number];

export const POPUPS = ["single", "missed"] as const;
export type PopupScene = (typeof POPUPS)[number];

export type Language = (typeof LANGUAGES)[number];

export const runtime: { scene: Scene; popup: PopupScene | null; lang: Language } = {
  scene: "list",
  popup: null,
  lang: "en",
};

export function readParams(): void {
  const q = new URLSearchParams(window.location.search);
  const scene = q.get("scene");
  const popup = q.get("popup");
  const lang = q.get("lang");

  runtime.scene = SCENES.includes(scene as Scene) ? (scene as Scene) : "list";
  runtime.popup = POPUPS.includes(popup as PopupScene) ? (popup as PopupScene) : null;
  runtime.lang = LANGUAGES.includes(lang) ? (lang as Language) : "en";
}
