import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { drawCvPdf, cvFileName, isCvEmpty, type CvData } from "./pdfFormatter";

/**
 * Smoke test for the CV renderer against the INSTALLED jsPDF.
 *
 * Added with the jsPDF 2 → 4 upgrade (a critical advisory in v2). The formatter
 * only touches core drawing APIs, so a version bump can't be checked by types
 * alone — this exercises the real ones (text wrapping, page breaks, fills,
 * lines, page numbering) and asserts a valid PDF comes out the other end.
 */
function makeDoc() {
  // Same construction as useGeneratePdf.
  return new jsPDF({ unit: "pt", format: "a4", compress: true });
}

const longParagraph = Array.from(
  { length: 60 },
  (_, i) => `Sentence ${i + 1} about analytical strengths and delivery focus.`,
).join(" ");

const cv: CvData = {
  name: "Ada Lovelace",
  strength: [
    "## Analytical thinking",
    longParagraph,
    "- Breaks problems into first principles",
    "- Communicates trade-offs clearly",
    "",
    "## Delivery",
    longParagraph,
  ].join("\n"),
  interest: [
    "## Interests",
    "- Mathematics",
    "- Mechanical computation",
    longParagraph,
  ].join("\n"),
};

function pdfHeader(doc: jsPDF): string {
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  return String.fromCharCode(...bytes.subarray(0, 5));
}

describe("drawCvPdf", () => {
  it("renders a valid PDF", () => {
    const doc = makeDoc();
    drawCvPdf(doc, cv);
    expect(pdfHeader(doc)).toBe("%PDF-");
  });

  it("paginates long content instead of overflowing one page", () => {
    const doc = makeDoc();
    drawCvPdf(doc, cv);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("renders the minimal case without throwing", () => {
    const doc = makeDoc();
    drawCvPdf(doc, { name: "A", strength: "Short.", interest: "" });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(pdfHeader(doc)).toBe("%PDF-");
  });

  it("treats content-free input as empty and builds a safe filename", () => {
    expect(isCvEmpty({ name: "A", strength: "", interest: "   " })).toBe(true);
    expect(isCvEmpty(cv)).toBe(false);
    expect(cvFileName("Ada Lovelace")).toMatch(/\.pdf$/);
  });
});
