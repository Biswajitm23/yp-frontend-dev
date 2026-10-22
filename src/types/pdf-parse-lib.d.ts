// Ambient type for pdf-parse's inner implementation entry point.
//
// We import `pdf-parse/lib/pdf-parse.js` directly (instead of the package root)
// because the package's index.js runs a debug block that reads a bundled sample
// PDF when it's the main module — the inner file skips that entirely. @types/
// pdf-parse only declares the package root, so we declare the subpath here.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
