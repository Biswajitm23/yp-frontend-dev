"use client";

// Client-side CV text extraction. PDFs are parsed with pdfjs-dist, which is
// dynamically imported so the (~1MB) library only loads when a user actually
// generates a summary from their CV — and never during SSR.
//
// We extract the text ourselves and hand plain text to the AI (a reliable
// text-only completion) instead of relying on the model's file-input support,
// which fails silently on some PDFs and on non-PDF formats.

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Same asset-URL pattern react-pdf uses. The bundler emits the worker and
      // returns a same-origin URL, so there's no CDN dependency or CSP issue.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * Extract the concatenated text of every page of a PDF. Returns "" when the PDF
 * has no extractable text (e.g. a scanned/image-only CV), so the caller can
 * fall back to another strategy.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfjs();
  // Copy the buffer — pdfjs may detach/transfer the one it's given.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
        .join(" ");
      pages.push(pageText);
    }
    return pages
      .join("\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } finally {
    try {
      await pdf.cleanup();
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}

/** Rough check that extracted text carries real content (not a few stray chars). */
export function hasUsableText(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().length >= 40;
}
