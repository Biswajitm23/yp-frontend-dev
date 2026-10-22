// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeDescriptionHtml } from "./sanitizeHtml";

// Verifies the shared admin-description sanitizer: it must strip exactly the
// four editor styling properties (font-family, color, background-color,
// background) — plus the legacy <font>/bgcolor equivalents — while keeping all
// other formatting intact, so the frontend renders "the exact same formatting"
// minus fonts/colours.

describe("sanitizeDescriptionHtml", () => {
  it("strips font-family from inline styles", () => {
    const out = sanitizeDescriptionHtml(
      '<p style="font-family: Arial, sans-serif;">Hello</p>',
    );
    expect(out).not.toMatch(/font-family/i);
    expect(out).toContain("Hello");
  });

  it("strips color, background-color and background", () => {
    const out = sanitizeDescriptionHtml(
      '<p style="color: rgb(17,17,17); background-color: #fff; background: red;">Hi</p>',
    );
    expect(out).not.toMatch(/color:/i);
    expect(out).not.toMatch(/background/i);
  });

  it("removes the style attribute entirely once all four props are gone", () => {
    const out = sanitizeDescriptionHtml(
      '<span style="font-family: Georgia; color: #000;">x</span>',
    );
    expect(out).not.toContain("style=");
  });

  it("keeps non-stripped style properties (e.g. text-align, font-weight)", () => {
    const out = sanitizeDescriptionHtml(
      '<p style="text-align: center; font-weight: bold; color: red;">x</p>',
    );
    expect(out).toMatch(/text-align:\s*center/i);
    expect(out).toMatch(/font-weight:\s*bold/i);
    expect(out).not.toMatch(/color:/i);
  });

  it("preserves structural formatting (headings, lists, bold, links)", () => {
    const html =
      "<h2>Title</h2><ul><li><strong>One</strong></li><li>Two</li></ul>" +
      '<a href="https://example.com">link</a>';
    const out = sanitizeDescriptionHtml(html);
    expect(out).toContain("<h2>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
    expect(out).toContain("<strong>");
    expect(out).toContain('href="https://example.com"');
  });

  it("strips legacy <font face/color> and bgcolor attributes", () => {
    const out = sanitizeDescriptionHtml(
      '<font face="Verdana" color="#333">t</font><td bgcolor="#eee">c</td>',
    );
    expect(out).not.toMatch(/face=/i);
    expect(out).not.toMatch(/color=/i);
    expect(out).not.toMatch(/bgcolor=/i);
    expect(out).toContain("t");
  });

  it("returns an empty string for empty / whitespace / nullish input", () => {
    expect(sanitizeDescriptionHtml("")).toBe("");
    expect(sanitizeDescriptionHtml("   ")).toBe("");
    expect(sanitizeDescriptionHtml(null)).toBe("");
    expect(sanitizeDescriptionHtml(undefined)).toBe("");
  });

  it("removes script tags (XSS safety retained)", () => {
    const out = sanitizeDescriptionHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("ok");
  });

  it("lets extra attributes through when addAttr is passed", () => {
    const out = sanitizeDescriptionHtml(
      '<a href="https://x.com" target="_blank" rel="noopener">l</a>',
      { addAttr: ["target", "rel"] },
    );
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener"/);
  });
});
