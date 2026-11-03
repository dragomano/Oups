import { api } from "./api";
import { PLURAL_CATEGORIES, type PluralForms } from "./plural";

type Dict = Record<string, unknown>;

export const i18n = $state<{ lang: string; dict: Dict }>({ lang: "ru", dict: {} });

export async function loadLocale(lang: string) {
  try {
    const dict = await api.getLocale(lang);
    i18n.dict = dict ?? {};
    i18n.lang = lang;
    document.documentElement.lang = lang;
    // Text direction is declared by the locale file itself, so a
    // right-to-left language needs no code of its own.
    document.documentElement.dir = localeDir();
  } catch (e) {
    console.error("failed to load locale", e);
  }
}

/** Dot-path lookup; null when the key is missing or does not hold a string. */
export function lookup(path: string): string | null {
  let cur: unknown = i18n.dict;

  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Dict)) {
      cur = (cur as Dict)[part];
    } else {
      return null;
    }
  }

  return typeof cur === "string" ? cur : null;
}

/** Dot-path lookup with {var} substitution; falls back to the key itself. */
export function t(path: string, vars?: Record<string, string | number>): string {
  let s = lookup(path) ?? path;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }

  return s;
}

/** The `meta` block of the loaded file: every locale describes itself. */
function meta(): Dict | null {
  const m = i18n.dict.meta;

  return m && typeof m === "object" ? (m as Dict) : null;
}

/** Plural declarations of the loaded file (`meta.plural_forms`), if any. */
export function pluralForms(): PluralForms | undefined {
  const raw = meta()?.plural_forms;

  if (!raw || typeof raw !== "object") return undefined;

  const out: PluralForms = {};
  let declared = false;

  for (const cat of PLURAL_CATEGORIES) {
    const slot = (raw as Dict)[cat];

    if (typeof slot === "number" && Number.isInteger(slot) && slot >= 0) {
      out[cat] = slot;
      declared = true;
    }
  }

  return declared ? out : undefined;
}

/** Grammatical gender of a unit's noun (`meta.unit_genders`), if declared. */
export function unitGender(unit: string): "m" | "f" | null {
  const raw = meta()?.unit_genders;

  if (!raw || typeof raw !== "object") return null;

  const g = (raw as Dict)[unit];

  return g === "m" || g === "f" ? g : null;
}

/** Direction declared by the loaded file; left-to-right unless it says so. */
export function localeDir(): "ltr" | "rtl" {
  return meta()?.dir === "rtl" ? "rtl" : "ltr";
}
