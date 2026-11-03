import { describe, expect, it } from "vitest";
import { noteLinkUrl, parseNoteLinks } from "./links";

const text = (s: string) => ({ kind: "text", text: s });
const link = (text: string, url: string) => ({ kind: "link", text, url });

describe("noteLinkUrl", () => {
  it("accepts the whitelisted schemes", () => {
    expect(noteLinkUrl("https://example.com/page?q=1")).toBe("https://example.com/page?q=1");
    expect(noteLinkUrl("http://example.com")).toBe("http://example.com");
    expect(noteLinkUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
    expect(noteLinkUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("normalizes a bare www host to https", () => {
    expect(noteLinkUrl("www.example.com")).toBe("https://www.example.com");
    expect(noteLinkUrl("WWW.Example.Com/path")).toBe("https://WWW.Example.Com/path");
  });

  it("rejects everything outside the whitelist", () => {
    expect(noteLinkUrl("javascript:alert(1)")).toBeNull();
    expect(noteLinkUrl("file:///C:/Windows")).toBeNull();
    expect(noteLinkUrl("ftp://example.com")).toBeNull();
    expect(noteLinkUrl("vbscript:x")).toBeNull();
    expect(noteLinkUrl("example.com")).toBeNull();
    expect(noteLinkUrl("")).toBeNull();
  });

  it("strips trailing sentence punctuation", () => {
    expect(noteLinkUrl("https://example.com.")).toBe("https://example.com");
    expect(noteLinkUrl("https://example.com,")).toBe("https://example.com");
    expect(noteLinkUrl("https://example.com;")).toBe("https://example.com");
    expect(noteLinkUrl("https://example.com!")).toBe("https://example.com");
    expect(noteLinkUrl("https://example.com?")).toBe("https://example.com");
    expect(noteLinkUrl("https://example.com:")).toBe("https://example.com");
  });

  it("keeps balanced parens, drops a lone closing one", () => {
    expect(noteLinkUrl("https://en.wikipedia.org/wiki/Rust_(programming_language)")).toBe(
      "https://en.wikipedia.org/wiki/Rust_(programming_language)",
    );
    // noteLinkUrl takes a token that starts with the scheme: leading text is
    // not its job, parseNoteLinks splits it off first.
    expect(noteLinkUrl("(https://example.com)")).toBeNull();
    // The token starts at the scheme, so the opening paren is foreign text
    // and its closing partner must not join the link.
    expect(noteLinkUrl("https://example.com)")).toBe("https://example.com");
  });

  it("does not mistake a bare scheme for a link", () => {
    expect(noteLinkUrl("https://")).toBeNull();
    expect(noteLinkUrl("https://.")).toBeNull();
    expect(noteLinkUrl("mailto:")).toBeNull();
    expect(noteLinkUrl("www.")).toBeNull();
  });
});

describe("parseNoteLinks", () => {
  it("keeps a link-free note as one text run", () => {
    expect(parseNoteLinks("Buy milk, call mom")).toEqual([text("Buy milk, call mom")]);
    expect(parseNoteLinks("")).toEqual([]);
  });

  it("splits a note around a link", () => {
    expect(parseNoteLinks("Read https://example.com/a today")).toEqual([
      text("Read "),
      link("https://example.com/a", "https://example.com/a"),
      text(" today"),
    ]);
  });

  it("leaves the trimmed tail to the following text", () => {
    expect(parseNoteLinks("Read https://example.com/a. Then sleep.")).toEqual([
      text("Read "),
      link("https://example.com/a", "https://example.com/a"),
      text(". Then sleep."),
    ]);
  });

  it("keeps the link out of quotes and angle brackets", () => {
    expect(parseNoteLinks('see "https://a.b" now')).toEqual([
      text('see "'),
      link("https://a.b", "https://a.b"),
      text('" now'),
    ]);
    expect(parseNoteLinks("<https://a.b>")).toEqual([
      text("<"),
      link("https://a.b", "https://a.b"),
      text(">"),
    ]);
  });

  it("returns several links in one note", () => {
    expect(parseNoteLinks("from www.a.b to https://c.d or mailto:e@f.gh")).toEqual([
      text("from "),
      link("www.a.b", "https://www.a.b"),
      text(" to "),
      link("https://c.d", "https://c.d"),
      text(" or "),
      link("mailto:e@f.gh", "mailto:e@f.gh"),
    ]);
  });

  it("recognizes a link at both edges of the note", () => {
    expect(parseNoteLinks("https://a.b ends here")).toEqual([
      link("https://a.b", "https://a.b"),
      text(" ends here"),
    ]);
    expect(parseNoteLinks("starts with www.a.b")).toEqual([
      text("starts with "),
      link("www.a.b", "https://www.a.b"),
    ]);
  });

  it("stops a link at a newline", () => {
    expect(parseNoteLinks("one https://a.b\ntwo")).toEqual([
      text("one "),
      link("https://a.b", "https://a.b"),
      text("\ntwo"),
    ]);
  });

  it("leaves look-alikes as plain text", () => {
    expect(parseNoteLinks("go to example.com")).toEqual([text("go to example.com")]);
    expect(parseNoteLinks("the awww.site.net page")).toEqual([text("the awww.site.net page")]);
    expect(parseNoteLinks("write me@www.provider.com")).toEqual([text("write me@www.provider.com")]);
  });
});
