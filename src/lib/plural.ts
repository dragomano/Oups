/**
 * Plural form selection, driven by the locale file itself.
 *
 * A file declares how its own language maps CLDR plural categories onto the
 * `"|"`-separated forms of `every_many.*`:
 *
 *   "meta": { "plural_forms": { "one": 0, "few": 1, "many": 2, "other": 2 } }
 *
 * The category for a count comes from `Intl.PluralRules` — a built-in the app
 * already leans on for `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`, not an
 * added dependency. So a language with one/few/many (ru, pl) or with all six
 * categories (ar, dual number included) is locale data, never a code branch.
 *
 * Everything here degrades instead of failing: a file that declares nothing
 * keeps the `"form for one | form for everything else"` reading the `"|"`
 * convention had before this module existed, an unusable language tag lands on
 * the same fallback, and a category the file did not mention falls back to slot
 * 1 — the same slot that undeclared files use for "everything else".
 */

export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** Category -> index into the `"|"`-separated forms of one key. */
export type PluralForms = Partial<Record<PluralCategory, number>>;

const rules = new Map<string, Intl.PluralRules | null>();

/** `Intl.PluralRules` for a language tag, or null when the tag is unusable. */
function rulesFor(lang: string): Intl.PluralRules | null {
  const cached = rules.get(lang);

  if (cached !== undefined) return cached;

  let made: Intl.PluralRules | null = null;

  try {
    made = new Intl.PluralRules(lang);
  } catch {
    // A locale file with a broken code must not take a label down with it.
    made = null;
  }

  rules.set(lang, made);

  return made;
}

/** CLDR category of a count, or null when the language tag is unusable. */
export function pluralCategory(lang: string, n: number): PluralCategory | null {
  const r = rulesFor(lang);

  if (!r) return null;

  const cat: string = r.select(n);

  return (PLURAL_CATEGORIES as readonly string[]).includes(cat) ? (cat as PluralCategory) : null;
}

/**
 * Index of the form `n` selects in `forms`, for this language and the
 * declarations of its locale file.
 */
export function pluralSlot(
  lang: string,
  forms: string[],
  declared: PluralForms | undefined,
  n: number,
): number {
  const last = forms.length - 1;

  // A single form (or none) has nothing to choose between.
  if (last < 1) return 0;

  const cat = pluralCategory(lang, n);
  const slot = cat ? (declared?.[cat] ?? declared?.other) : undefined;

  if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot <= last) return slot;

  // Undeclared language, or a category this file left out: the original
  // two-form reading, where slot 1 means "everything else".
  return n === 1 ? 0 : Math.min(1, last);
}
