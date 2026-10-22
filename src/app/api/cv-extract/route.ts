import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Server-side CV → plain-text extraction using `pdf-parse` (a Node-only lib).
//
// The uploaded CV lives on public storage; the browser can't parse it reliably
// (pdfjs works but is heavy client-side and fails on some PDFs), so this route
// fetches the PDF server→server (no CORS) and turns it into text with
// pdf-parse. The client posts the resume URL and gets `{ text }` back, which it
// then hands to the AI. On any failure the client falls back to its own
// client-side pdfjs extraction, so this route can never break the flow.
export const runtime = "nodejs"; // pdf-parse needs Node APIs, not the Edge runtime.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// SSRF guard — mirror /api/resource-file: only the known public storage hosts
// are allowed. The files are already public, so no auth is required.
const ALLOWED_HOSTS = new Set<string>([
  "storage.googleapis.com",
  "admin.youngprofessionals.global",
]);

function isAllowed(target: URL): boolean {
  if (target.protocol !== "https:") return false;
  if (!ALLOWED_HOSTS.has(target.hostname)) return false;
  if (
    target.hostname === "storage.googleapis.com" &&
    !target.pathname.startsWith("/yp-storage/")
  ) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body?.url;
  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isAllowed(target)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  // Only PDFs are handled here; anything else is left to the caller's fallback.
  const looksPdf = /\.pdf(\?|#|$)/i.test(target.pathname);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isPdf = looksPdf || /pdf/i.test(contentType);
  if (!isPdf) {
    // Non-PDF (e.g. a scanned image or .docx): report unsupported so the caller
    // uses its own path (the AI file-input fallback).
    return NextResponse.json(
      { error: "Unsupported file type", text: "" },
      { status: 415 },
    );
  }

  let text = "";
  try {
    const bytes = await upstream.arrayBuffer();
    const parsed = await pdfParse(Buffer.from(bytes));
    text = (parsed?.text ?? "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (err) {
    console.error("[cv-extract] pdf-parse failed:", err);
    return NextResponse.json(
      { error: "PDF parse failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ text }, { status: 200 });
}
