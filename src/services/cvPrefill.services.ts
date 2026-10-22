// CV pre-fill service — reads an uploaded CV and maps it onto the fixed
// AI-summary questions.
//
// OpenAI is NEVER called from the browser here: both the text and file parses
// POST to the same-origin, auth-gated /api/ai/chat route, which holds the API
// key server-side. (Previously this used a browser OpenAI client with
// NEXT_PUBLIC_OPENAI_API_KEY, which leaked the key into DevTools.)
//
// Strategy:
//   1. Preferred — extract the CV text (server pdf-parse, else client pdfjs) and
//      send PLAIN TEXT to the model. Deterministic and works with any model.
//   2. Fallback — send the file itself to a file-capable model (handles
//      scanned/image PDFs and formats we can't extract text from).

import {
  CV_PREFILL_SYSTEM,
  buildCvPrefillUserPrompt,
  buildCvPrefillTextPrompt,
  type PrefillQuestion,
  type CvPrefillHints,
} from "@/components/profile/AISummery/cvPrefillPrompt";
import { extractPdfText, hasUsableText } from "@/services/cvTextExtract";

export type { PrefillQuestion, CvPrefillHints };

/** Result of a CV parse: the per-question answers plus the CV's education list. */
export interface CvParseResult {
  answers: Record<string, string>;
  /** Every education entry read from the CV (most recent first). */
  education: string[];
}

// Text-only parse (preferred path). Any chat model handles this.
const TEXT_PARSE_MODELS = {
  primary: "gpt-4o-mini",
  fallback: "gpt-4o",
} as const;

// File-capable models only (fallback path). gpt-3.5-turbo is text-only, so it
// is deliberately excluded here — the file path sends the CV as a file part.
const FILE_PARSE_MODELS = {
  primary: "gpt-4o-mini",
  fallback: "gpt-4o",
} as const;

// POST a chat completion to our server-side proxy (keeps the OpenAI key off the
// browser). Returns the assistant message content, or throws on a non-200.
async function postChat(payload: {
  model: string;
  messages: unknown[];
  temperature?: number;
  response_format?: unknown;
}): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`ai/chat request failed: ${res.status}`);
  const data = (await res.json().catch(() => null)) as {
    content?: string;
  } | null;
  return typeof data?.content === "string" ? data.content : "";
}

// Fetch the CV through the same-origin proxy (bypasses the storage bucket's
// missing CORS header). Returns the raw bytes and the resolved content-type.
export async function fetchCvBytes(
  resumeUrl: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(
    `/api/resource-file?url=${encodeURIComponent(resumeUrl)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`CV fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type") || "application/pdf";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

// Base64 data URL for an OpenAI file part (fallback path).
export async function fetchCvAsDataUrl(resumeUrl: string): Promise<string> {
  const { bytes, contentType } = await fetchCvBytes(resumeUrl);
  return `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Safety guard: strip to the first { … last }, JSON.parse, then validate and
// clamp against our questions. Anything missing/invalid → "" for that question.
export function safeParseAnswers(
  raw: string,
  questions: PrefillQuestion[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) out[q.id] = "";

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return out;

  let parsed: any;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return out;
  }

  const answers = parsed?.answers ?? parsed ?? {};
  for (const q of questions) {
    const v = answers?.[q.id];
    if (typeof v === "string" && v.trim()) {
      const max = parseInt(q.max_length ?? "", 10) || 300;
      out[q.id] = v.trim().slice(0, max);
    }
  }
  return out;
}

const hasAnyAnswer = (answers: Record<string, string>): boolean =>
  Object.values(answers).some((v) => v.trim());

// Pull the "education" array (list of CV education lines) out of the model's
// JSON. Tolerant of extra prose around the JSON; returns [] on any problem.
export function safeParseEducation(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const edu = parsed?.education;
  if (!Array.isArray(edu)) return [];
  return edu
    .filter((e: any): e is string => typeof e === "string" && e.trim() !== "")
    .map((e: string) => e.trim());
}

// ─── Text-only parse (preferred) ──────────────────────────────────────────────

async function callTextParse(model: string, userText: string): Promise<string> {
  return postChat({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CV_PREFILL_SYSTEM },
      { role: "user", content: userText },
    ],
  });
}

async function parseFromText(
  cvText: string,
  questions: PrefillQuestion[],
  name?: string,
  hints?: CvPrefillHints,
): Promise<CvParseResult> {
  const userText = buildCvPrefillTextPrompt(questions, cvText, name, hints);
  let raw: string;
  try {
    raw = await callTextParse(TEXT_PARSE_MODELS.primary, userText);
  } catch (err) {
    console.warn("[cvPrefill] text primary model failed, trying fallback", err);
    raw = await callTextParse(TEXT_PARSE_MODELS.fallback, userText);
  }
  return {
    answers: safeParseAnswers(raw, questions),
    education: safeParseEducation(raw),
  };
}

// ─── File parse (fallback) ────────────────────────────────────────────────────

async function callFileParse(
  model: string,
  userText: string,
  fileDataUrl: string,
): Promise<string> {
  return postChat({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CV_PREFILL_SYSTEM },
      {
        role: "user",
        // PDF/image file part preserves CV layout (columns/tables).
        content: [
          { type: "text", text: userText },
          { type: "file", file: { filename: "cv.pdf", file_data: fileDataUrl } },
        ],
      },
    ],
  });
}

async function parseFromFile(
  bytes: ArrayBuffer,
  contentType: string,
  questions: PrefillQuestion[],
  name?: string,
  hints?: CvPrefillHints,
): Promise<CvParseResult> {
  const fileDataUrl = `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
  const userText = buildCvPrefillUserPrompt(questions, name, hints);
  let raw: string;
  try {
    raw = await callFileParse(FILE_PARSE_MODELS.primary, userText, fileDataUrl);
  } catch (err) {
    console.warn("[cvPrefill] file primary model failed, trying fallback", err);
    raw = await callFileParse(FILE_PARSE_MODELS.fallback, userText, fileDataUrl);
  }
  return {
    answers: safeParseAnswers(raw, questions),
    education: safeParseEducation(raw),
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

// Extract the CV text on the server with `pdf-parse` (Node). Returns "" on any
// non-200 / malformed response so the caller falls back to client-side pdfjs.
async function extractPdfTextViaServer(resumeUrl: string): Promise<string> {
  const res = await fetch("/api/cv-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: resumeUrl }),
    cache: "no-store",
  });
  if (!res.ok) return "";
  const data = (await res.json().catch(() => null)) as { text?: string } | null;
  return typeof data?.text === "string" ? data.text : "";
}

// Parse the CV into a { questionId: answer } map (+ its education list).
// Order of preference:
//   1. Server-side `pdf-parse` text extraction → AI over the text.
//   2. Client-side pdfjs text extraction → AI over the text.
//   3. Send the file itself to a file-capable model.
// Each step falls through on failure/empty, so a single flaky path never breaks
// the flow; only when ALL fail does this throw (caller then uses the manual flow).
export async function parseCvToAnswers(
  resumeUrl: string,
  questions: PrefillQuestion[],
  name?: string,
  hints?: CvPrefillHints,
): Promise<CvParseResult> {
  // 1) Preferred: server-side pdf-parse extraction, then AI over the text.
  try {
    const serverText = await extractPdfTextViaServer(resumeUrl);
    if (hasUsableText(serverText)) {
      const result = await parseFromText(serverText, questions, name, hints);
      if (hasAnyAnswer(result.answers) || result.education.length > 0)
        return result;
      console.warn(
        "[cvPrefill] server pdf-parse text yielded nothing, trying client",
      );
    }
  } catch (err) {
    console.warn("[cvPrefill] server pdf-parse path failed, trying client", err);
  }

  // Bytes are needed for the client-side fallbacks below.
  const { bytes, contentType } = await fetchCvBytes(resumeUrl);
  const isPdf = /pdf/i.test(contentType) || /\.pdf(\?|#|$)/i.test(resumeUrl);

  // 2) Fallback: client-side pdfjs text extraction, then AI over the text.
  if (isPdf) {
    try {
      const cvText = await extractPdfText(bytes);
      if (hasUsableText(cvText)) {
        const result = await parseFromText(cvText, questions, name, hints);
        if (hasAnyAnswer(result.answers) || result.education.length > 0)
          return result;
        console.warn("[cvPrefill] client text parse produced nothing, trying file");
      } else {
        console.warn("[cvPrefill] no usable client text extracted, trying file");
      }
    } catch (err) {
      console.warn("[cvPrefill] client text extraction failed, trying file", err);
    }
  }

  // 3) Last resort: send the file itself to a file-capable model.
  return parseFromFile(bytes, contentType, questions, name, hints);
}
