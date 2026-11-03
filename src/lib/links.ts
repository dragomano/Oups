/**
 * Plain-text link detection for reminder notes.
 *
 * A note stays plain text; recognized fragments are split out so the caller
 * can render them as clickable links. Detection is deliberately conservative:
 *
 * - an explicit `http://` / `https://` URL,
 * - a `mailto:` address,
 * - a bare `www.` host (normalized to https),
 *
 * and nothing else. A domain without a scheme ("example.com") is left as
 * text on purpose — file names and abbreviations would turn into links.
 * The `www.` form also refuses to start inside a word or an address
 * ("awww.foo", "user@www.example.com" stay text).
 */

export type NotePart = { kind: "text"; text: string } | { kind: "link"; text: string; url: string };

/**
 * Candidate links run to the next whitespace; angle brackets and quotes end
 * them too, so `see "https://a.b"` keeps the quote out of the link.
 * The lookbehind keeps the `www.` form from matching inside a word.
 */
const LINK_RE = /(?:https?:\/\/|mailto:|(?<![\w@.])www\.)[^\s<>"']+/gi;

/** Schemes a note link may carry — the same list Rust re-checks. */
const SCHEME_RE = /^(?:https?:\/\/|mailto:|www\.)/i;

/**
 * The link text of a candidate token, or null when the token is not one:
 * sentence punctuation glued to a URL does not belong to the link, and a
 * closing paren only belongs to it when the token itself opened one
 * ("(see https://a.b)" vs a wiki link ending in ")").
 */
function trimToken(raw: string): string | null {
  if (!SCHEME_RE.test(raw)) return null;

  let url = raw;
  for (;;) {
    const trimmed = url.replace(/[.,;:!?]+$/, "");
    if (trimmed !== url) {
      url = trimmed;
      continue;
    }
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (url.endsWith(")") && closes > opens) {
      url = url.slice(0, -1);
      continue;
    }
    // Trimming can land on the bare scheme itself ("https://." or a
    // "mailto:" whose colon was eaten): no address behind it, no link.
    return /^(?:https?:\/\/|mailto:?|www\.?)$/i.test(url) ? null : url;
  }
}

/** `www.` opens as https; the other schemes open as written. */
function toUrl(text: string): string {
  return /^www\./i.test(text) ? `https://${text}` : text;
}

/** The URL behind a note fragment, or null when it is not a usable link. */
export function noteLinkUrl(raw: string): string | null {
  const text = trimToken(raw);
  return text ? toUrl(text) : null;
}

/** Splits a note into text runs and clickable links, in order. */
export function parseNoteLinks(note: string): NotePart[] {
  const parts: NotePart[] = [];
  let last = 0;

  for (const m of note.matchAll(LINK_RE)) {
    const token = m[0];
    const start = m.index ?? 0;
    const text = trimToken(token);
    if (!text) continue; // no usable link inside: the token stays plain text

    if (start > last) parts.push({ kind: "text", text: note.slice(last, start) });
    parts.push({ kind: "link", text, url: toUrl(text) });
    last = start + text.length;
  }

  if (last < note.length) parts.push({ kind: "text", text: note.slice(last) });
  return parts;
}
