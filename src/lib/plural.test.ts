import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n, t } from "./i18n.svelte";
import { PLURAL_CATEGORIES, pluralCategory, pluralSlot } from "./plural";
import { SNOOZE_UNITS } from "./snooze";
import { declinedWord, everyPrefix, formatUnit, recurrenceText } from "./time";

/**
 * Plural handling is a per-language table, not per-language code: a locale file
 * declares which CLDR category takes which `"|"`-separated form, and
 * `Intl.PluralRules` supplies the category. These tests cover the engine, the
 * fallbacks that keep a hand-written locale from breaking a label, and the
 * shipped files themselves — the point of the last group is that adding a
 * language is a data change, so the only way to break it is bad data.
 */

const LOCALES = join(__dirname, "..", "..", "locales");

/** Files that ship in locales/, e.g. ["ar", "de", "en", "pl", "ru"]. */
function shippedCodes(): string[] {
  return readdirSync(LOCALES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

type Dict = Record<string, unknown>;

function readLocale(code: string): Dict {
  return JSON.parse(readFileSync(join(LOCALES, `${code}.json`), "utf8")) as Dict;
}

/** Point the app's dictionary at a shipped file, the way loadLocale does. */
function useLocale(code: string): Dict {
  const dict = readLocale(code);
  i18n.lang = code;
  i18n.dict = dict;
  return dict;
}

/** Every leaf key path of a dictionary, e.g. "editor.every_f". */
function keyPaths(obj: Dict, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...keyPaths(v as Dict, path));
    else out.push(path);
  }
  return out;
}

/** `{day}`-style placeholders of a string, sorted. */
function placeholders(s: string): string[] {
  return (s.match(/\{[a-z]+\}/g) ?? []).sort();
}

function at(obj: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, part) => (cur as Dict)?.[part], obj);
}

/** Keys a translation may leave out: they are only consulted when the file
 *  declares `meta.unit_genders` for grammatical gender (ru uses them, de/pl/ar
 *  do not need them at all). */
const OPTIONAL_KEYS = ["editor.every_m", "editor.every_f"];

/**
 * Keys every shipped file has to carry: the English set, minus the optional
 * gender words and minus `meta.*` — the meta block is a file's own
 * self-description, so its shape is per language by definition
 * (ru declares `unit_genders`, ar declares six plural categories).
 */
const REQUIRED_KEYS = keyPaths(readLocale("en")).filter(
  (k) => !k.startsWith("meta.") && !OPTIONAL_KEYS.includes(k),
);

const DE = { one: 0, other: 1 };
const RU = { one: 0, few: 1, many: 2, other: 2 };
const PL = { one: 0, few: 1, many: 2, other: 2 };
const AR = { zero: 0, one: 0, two: 2, few: 3, many: 1, other: 0 };

const SIX = ["أ", "ب", "ج", "د", "هـ", "و"];

describe("pluralCategory", () => {
  it("reports the CLDR category of a count", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 0)).toBe("other");
    expect(pluralCategory("de", 1)).toBe("one");
    expect(pluralCategory("pl", 5)).toBe("many");
    expect(pluralCategory("pl", 22)).toBe("few");
    expect(pluralCategory("ar", 2)).toBe("two");
    expect(pluralCategory("ar", 3)).toBe("few");
    expect(pluralCategory("ar", 15)).toBe("many");
  });

  it("returns null instead of throwing for an unusable language tag", () => {
    expect(pluralCategory("no such tag", 1)).toBeNull();
    expect(pluralCategory("", 1)).toBeNull();
  });
});

describe("pluralSlot", () => {
  it("keeps the historical two-form reading for a file that declares nothing", () => {
    const forms = ["minute", "minutes"];
    expect(pluralSlot("de", forms, undefined, 1)).toBe(0);
    expect(pluralSlot("de", forms, undefined, 2)).toBe(1);
    expect(pluralSlot("de", forms, undefined, 101)).toBe(1);
  });

  it("follows German and English: one against everything else", () => {
    const forms = ["Minute", "Minuten"];
    expect(pluralSlot("de", forms, DE, 1)).toBe(0);
    expect(pluralSlot("de", forms, DE, 2)).toBe(1);
    expect(pluralSlot("de", forms, DE, 21)).toBe(1);
  });

  it("follows Russian: 1 / 2-4 / everything else, including the 11-14 trap", () => {
    const forms = ["минуту", "минуты", "минут"];
    expect(pluralSlot("ru", forms, RU, 1)).toBe(0);
    expect(pluralSlot("ru", forms, RU, 2)).toBe(1);
    expect(pluralSlot("ru", forms, RU, 5)).toBe(2);
    expect(pluralSlot("ru", forms, RU, 11)).toBe(2);
    expect(pluralSlot("ru", forms, RU, 21)).toBe(0);
    expect(pluralSlot("ru", forms, RU, 22)).toBe(1);
    expect(pluralSlot("ru", forms, RU, 25)).toBe(2);
    expect(pluralSlot("ru", forms, RU, 101)).toBe(0);
    expect(pluralSlot("ru", forms, RU, 111)).toBe(2);
  });

  it("follows Polish, which shares the shape but not the boundaries of Russian", () => {
    const forms = ["minuta", "minuty", "minut"];
    expect(pluralSlot("pl", forms, PL, 1)).toBe(0);
    expect(pluralSlot("pl", forms, PL, 2)).toBe(1);
    expect(pluralSlot("pl", forms, PL, 4)).toBe(1);
    expect(pluralSlot("pl", forms, PL, 5)).toBe(2);
    expect(pluralSlot("pl", forms, PL, 12)).toBe(2);
    expect(pluralSlot("pl", forms, PL, 22)).toBe(1);
    expect(pluralSlot("pl", forms, PL, 25)).toBe(2);
    expect(pluralSlot("pl", forms, PL, 101)).toBe(2);
  });

  it("follows Arabic, dual number included", () => {
    expect(pluralSlot("ar", SIX, AR, 0)).toBe(0);
    expect(pluralSlot("ar", SIX, AR, 1)).toBe(0);
    expect(pluralSlot("ar", SIX, AR, 2)).toBe(2);
    expect(pluralSlot("ar", SIX, AR, 3)).toBe(3);
    expect(pluralSlot("ar", SIX, AR, 10)).toBe(3);
    expect(pluralSlot("ar", SIX, AR, 11)).toBe(1);
    expect(pluralSlot("ar", SIX, AR, 99)).toBe(1);
    expect(pluralSlot("ar", SIX, AR, 100)).toBe(0);
    expect(pluralSlot("ar", SIX, AR, 101)).toBe(0);
    expect(pluralSlot("ar", SIX, AR, 103)).toBe(3);
    expect(pluralSlot("ar", SIX, AR, 111)).toBe(1);
  });

  it("degrades to the second form when a declaration is incomplete or out of range", () => {
    const forms = ["a", "b", "c"];
    // Declared, but nothing for this category and no "other".
    expect(pluralSlot("ru", forms, { one: 0 }, 5)).toBe(1);
    // Declared with a slot the file does not have.
    expect(pluralSlot("ru", forms, { one: 0, other: 7 }, 5)).toBe(1);
    // Unusable tag: the declaration cannot be used, so the reading falls back.
    expect(pluralSlot("no such tag", forms, AR, 2)).toBe(1);
  });

  it("has nothing to choose between in a single-form list", () => {
    expect(pluralSlot("ar", ["only"], AR, 5)).toBe(0);
    expect(pluralSlot("ar", [], AR, 5)).toBe(0);
  });
});

describe("declined unit across shipped languages", () => {
  beforeEach(() => {
    useLocale("en");
  });

  it("renders Russian exactly as before the engine became data-driven", () => {
    useLocale("ru");
    expect(formatUnit("minutes", 1)).toBe("минуту");
    expect(formatUnit("minutes", 5)).toBe("минут");
    expect(formatUnit("hours", 21)).toBe("час");
    expect(everyPrefix("minutes", 21)).toBe("Каждую");
    expect(everyPrefix("hours", 21)).toBe("Каждый");
    expect(everyPrefix("hours", 5)).toBe("Каждые");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 5 })).toBe("Каждые 5 минут");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 21 })).toBe("Каждый 21 час");
  });

  it("renders Spanish, which needs neither a third form nor a gender", () => {
    useLocale("es");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("Cada minuto");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 3 })).toBe("Cada 3 horas");
    expect(recurrenceText({ type: "interval", unit: "days", n: 21 })).toBe("Cada 21 días");
    expect(formatUnit("months", 5)).toBe("meses");
    expect(everyPrefix("weeks", 1)).toBe("Cada");
  });

  it("renders Ukrainian: Russian's categories, its own genders", () => {
    useLocale("uk");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("Кожну хвилину");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 5 })).toBe("Кожні 5 хвилин");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 21 })).toBe("Кожну 21 хвилину");
    expect(recurrenceText({ type: "interval", unit: "days", n: 22 })).toBe("Кожні 22 дні");
    expect(recurrenceText({ type: "interval", unit: "years", n: 101 })).toBe("Кожен 101 рік");

    // Ukrainian "година" is feminine and "тиждень" masculine — exactly the
    // opposite of Russian "час"/"неделя" — so those genders have to come from
    // the file rather than from anything shared between the two languages.
    useLocale("ru");
    expect(everyPrefix("hours", 21)).toBe("Каждый");
    expect(everyPrefix("weeks", 21)).toBe("Каждую");
    useLocale("uk");
    expect(everyPrefix("hours", 21)).toBe("Кожну");
    expect(everyPrefix("weeks", 21)).toBe("Кожен");
  });

  it("renders German", () => {
    useLocale("de");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("Jede Minute");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 3 })).toBe("Alle 3 Stunden");
    expect(recurrenceText({ type: "interval", unit: "days", n: 21 })).toBe("Alle 21 Tage");
    expect(formatUnit("years", 5)).toBe("Jahre");
  });

  it("renders Polish without any gendered prefix in the file", () => {
    useLocale("pl");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("Co minutę");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 2 })).toBe("Co 2 minuty");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 5 })).toBe("Co 5 minut");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 22 })).toBe("Co 22 minuty");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 101 })).toBe("Co 101 godzin");
    expect(everyPrefix("hours", 21)).toBe("Co");
  });

  it("renders Arabic, where more than two forms are unavoidable", () => {
    useLocale("ar");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 1 })).toBe("كل دقيقة");
    // The numeral is part of the label for any n > 1, so the dual reads with it.
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 2 })).toBe("كل 2 دقيقتين");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 5 })).toBe("كل 5 دقائق");
    expect(recurrenceText({ type: "interval", unit: "minutes", n: 15 })).toBe("كل 15 دقيقةً");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 3 })).toBe("كل 3 ساعات");
    expect(recurrenceText({ type: "interval", unit: "years", n: 101 })).toBe("كل 101 سنة");
  });

  it("still works for a hand-written locale that declares nothing at all", () => {
    i18n.lang = "xx";
    i18n.dict = {
      editor: { every: "Every" },
      every_one: { hours: "Every hour" },
      every_many: { hours: "hour|hours" },
    } as unknown as Dict;
    expect(recurrenceText({ type: "interval", unit: "hours", n: 1 })).toBe("Every hour");
    expect(recurrenceText({ type: "interval", unit: "hours", n: 3 })).toBe("Every 3 hours");
    // A gendered key is only consulted when the file declares a gender.
    expect(everyPrefix("minutes", 1)).toBe("Every");
  });
});

/**
 * The snooze popup's custom-duration label reuses the recurrence noun
 * (`every_many.minutes`): "через 1 минуту" declines exactly like
 * "Каждую 1 минуту" in every shipped language.
 */
describe("custom snooze minute label", () => {
  it("declines Russian minutes for the implied delay", () => {
    useLocale("ru");
    for (const [n, word] of [
      [0, "минут"],
      [1, "минуту"],
      [2, "минуты"],
      [5, "минут"],
      [11, "минут"],
      [21, "минуту"],
      [22, "минуты"],
      [25, "минут"],
    ] as const) {
      expect(formatUnit("minutes", n)).toBe(word);
    }
  });

  it("uses singular and plural English labels", () => {
    useLocale("en");
    expect(formatUnit("minutes", 1)).toBe("minute");
    expect(formatUnit("minutes", 2)).toBe("minutes");
  });

  it("keeps the Polish one-form accusative, as the delay needs", () => {
    // Recurrence reads n=1 through `every_one` ("Co minutę"), so the shared
    // table's one-form is free to carry the accusative the popup needs:
    // "za 1 minutę", not "za 1 minuta".
    useLocale("pl");
    expect(formatUnit("minutes", 1)).toBe("minutę");
    expect(formatUnit("minutes", 2)).toBe("minuty");
    expect(formatUnit("minutes", 5)).toBe("minut");
  });
});

/** The noun the editor writes after the count; `end.after` sets its case. */
describe("declined count noun across shipped languages", () => {
  beforeEach(() => {
    useLocale("en");
  });

  /** The label the editor actually shows: `<After> [n] <noun>`. */
  function phrase(n: number): string {
    return `${t("end.after")} ${n} ${declinedWord("end.count_noun", n)}`;
  }

  it("declines the Russian noun in the genitive its «После» requires", () => {
    useLocale("ru");
    expect(phrase(1)).toBe("После 1 повтора");
    expect(phrase(2)).toBe("После 2 повторов");
    expect(phrase(5)).toBe("После 5 повторов");
    // The numeral agrees in the genitive, so only "one" stays singular.
    expect(declinedWord("end.count_noun", 11)).toBe("повторов");
    expect(declinedWord("end.count_noun", 21)).toBe("повтора");
    expect(declinedWord("end.count_noun", 22)).toBe("повторов");
    expect(declinedWord("end.count_noun", 25)).toBe("повторов");
    expect(declinedWord("end.count_noun", 101)).toBe("повтора");
  });

  it("declines the Ukrainian noun in the genitive its «Після» requires", () => {
    useLocale("uk");
    expect(phrase(1)).toBe("Після 1 повтора");
    expect(phrase(2)).toBe("Після 2 повторів");
    expect(declinedWord("end.count_noun", 5)).toBe("повторів");
    expect(declinedWord("end.count_noun", 21)).toBe("повтора");
  });

  it("declines Polish in the locative its «Po» requires", () => {
    useLocale("pl");
    expect(phrase(1)).toBe("Po 1 powtórzeniu");
    expect(phrase(2)).toBe("Po 2 powtórzeniach");
    expect(declinedWord("end.count_noun", 5)).toBe("powtórzeniach");
    // CLDR counts the bare cardinal, so Polish "many" claims 21 and reads plural.
    expect(declinedWord("end.count_noun", 21)).toBe("powtórzeniach");
  });

  it("leaves the languages whose noun does not change case after a numeral", () => {
    expect(phrase(1)).toBe("After 1 repeat");
    expect(phrase(5)).toBe("After 5 repeats");
    useLocale("de");
    expect(phrase(1)).toBe("Nach 1 Wiederholung");
    expect(phrase(5)).toBe("Nach 5 Wiederholungen");
    useLocale("es");
    expect(phrase(1)).toBe("Después de 1 repetición");
    expect(phrase(5)).toBe("Después de 5 repeticiones");
  });

  it("declines Arabic across all six categories", () => {
    useLocale("ar");
    expect(declinedWord("end.count_noun", 0)).toBe("تكرار");
    expect(declinedWord("end.count_noun", 1)).toBe("تكرار");
    expect(declinedWord("end.count_noun", 2)).toBe("تكرارين");
    expect(declinedWord("end.count_noun", 5)).toBe("تكرارات");
    expect(declinedWord("end.count_noun", 15)).toBe("تكرارًا");
    expect(declinedWord("end.count_noun", 101)).toBe("تكرار");
  });

  it("still reads for a hand-written locale with no plural table at all", () => {
    i18n.lang = "xx";
    i18n.dict = { end: { count_noun: "repeat|repeats" } } as unknown as Dict;
    expect(declinedWord("end.count_noun", 1)).toBe("repeat");
    expect(declinedWord("end.count_noun", 7)).toBe("repeats");
  });
});

describe("shipped locale files", () => {
  const codes = shippedCodes();
  const en = readLocale("en");

  it("are found at all", () => {
    expect(codes).toContain("en");
    expect(codes).toContain("ru");
  });

  describe.each(codes)("%s.json", (code) => {
    const dict = readLocale(code);
    const meta = (dict.meta ?? {}) as Dict;

    it("describes itself: meta.code matches the file name", () => {
      expect(meta.code).toBe(code);
      expect(typeof meta.name).toBe("string");
      expect((meta.name as string).length).toBeGreaterThan(0);
    });

    it("declares a usable text direction", () => {
      const dir = meta.dir;
      expect(dir === undefined || dir === "ltr" || dir === "rtl").toBe(true);
    });

    it("declares plural slots that exist in every form list", () => {
      const declared = meta.plural_forms as Record<string, number> | undefined;
      const units = Object.keys(dict.every_many as Dict);

      expect(units.length).toBeGreaterThan(0);

      // The one plural table indexes every `|`-separated list in the file.
      const lists: [string, string[]][] = [
        ...units.map(
          (unit) => [unit, String((dict.every_many as Dict)[unit]).split("|")] as [string, string[]],
        ),
        ["end.count_noun", String(at(dict, "end.count_noun")).split("|")],
        ...SNOOZE_UNITS.map(
          (unit) =>
            [`popup.snooze_units.${unit}`, String(at(dict, `popup.snooze_units.${unit}`)).split("|")] as [
              string,
              string[],
            ],
        ),
      ];

      for (const [label, forms] of lists) {
        expect(forms.length, `${label} forms`).toBeGreaterThan(1);
        for (const form of forms) expect(form.trim().length, `${label} form`).toBeGreaterThan(0);
        for (const slot of Object.values(declared ?? {})) {
          expect(slot, `${label} slot`).toBeLessThan(forms.length);
        }
      }
      for (const cat of Object.keys(declared ?? {})) {
        expect(PLURAL_CATEGORIES as readonly string[]).toContain(cat);
        expect(Number.isInteger(declared?.[cat])).toBe(true);
      }
    });

    it("declares unit genders only together with the gendered words", () => {
      const genders = meta.unit_genders as Record<string, string> | undefined;
      if (!genders) return;

      for (const [unit, gender] of Object.entries(genders)) {
        expect(Object.keys(dict.every_many as Dict)).toContain(unit);
        expect(["m", "f"]).toContain(gender);
      }
      // A declared gender is only useful when both words are there.
      expect(dict.editor).toHaveProperty("every_m");
      expect(dict.editor).toHaveProperty("every_f");
    });

    it("covers every key of the English file", () => {
      const have = new Set(keyPaths(dict));
      expect(REQUIRED_KEYS.filter((k) => !have.has(k))).toEqual([]);
    });

    it("keeps every {placeholder} of the English string", () => {
      for (const key of REQUIRED_KEYS) {
        const mine = at(dict, key);
        const theirs = at(en, key);
        if (typeof mine !== "string" || typeof theirs !== "string") continue;
        expect(placeholders(mine), key).toEqual(placeholders(theirs));
      }
    });

    it("renders through t() without ever showing a raw key", () => {
      useLocale(code);
      for (const key of REQUIRED_KEYS) {
        const value = t(key);
        expect(value, key).not.toBe(key);
        expect(value.trim().length, key).toBeGreaterThan(0);
      }
    });
  });
});
