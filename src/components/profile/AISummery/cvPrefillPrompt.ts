// CV pre-fill prompt (Variant B) — maps an uploaded CV onto the fixed AI-summary
// questions. Kept isolated from the generation prompts so it can be tuned or
// debugged without touching the summary-generation flow.

export interface PrefillQuestion {
  id: string;
  question: string;
  max_length?: string;
}

// Extra context pulled from the candidate's EXISTING profile (educations,
// skills). Merged with the CV so answers can draw from BOTH sources — e.g.
// education from `user.educations` and skills from `user.skills`, not just what
// the CV happens to spell out.
export interface CvPrefillHints {
  education?: string[];
  skills?: string[];
}

export const CV_PREFILL_SYSTEM =
  "You extract structured answers from a candidate's CV and their existing profile, and reply with strict JSON only.";

// Renders the "known profile info" block appended to both prompt variants. Empty
// string when there are no hints, so the prompt is unchanged for those cases.
function knownInfoBlock(hints?: CvPrefillHints): string {
  const lines: string[] = [];
  if (hints?.education?.length)
    lines.push(`- Education: ${hints.education.filter(Boolean).join("; ")}`);
  if (hints?.skills?.length)
    lines.push(`- Skills: ${hints.skills.filter(Boolean).join(", ")}`);
  if (!lines.length) return "";
  return `

KNOWN PROFILE INFO (from the candidate's saved profile - treat this as equally reliable as the CV and use it to answer, especially for education and skills the CV may not spell out):
${lines.join("\n")}`;
}

const RULES = (maxChars: number) => `Rules:
- Use only information present in the CV or the known profile info. Do NOT invent details, infer beyond the evidence, or use outside knowledge.
- Combine BOTH sources: education and skills in particular may come from the CV, from the known profile info, or both - merge them.
- For ANY question about education, studies, qualifications, degrees, or academic background: ALWAYS answer it by pulling the candidate's education from the CV's education section AND the known profile info (course/degree, institution, years, and current field of study). Never leave an education question blank when either source contains education details.
- If neither source has enough information to answer a question, return an empty string "".
- Write each answer naturally and concisely (1-3 sentences), first person, as the candidate.
- Keep each answer under ${maxChars} characters.`;

const JSON_INSTRUCTION = `Respond with STRICT JSON only, of the exact shape:
{ "answers": { "<question id>": "<answer or empty string>" }, "education": ["<one line per education entry>"] }
Include every question id as a key in "answers". The "education" array must list EVERY education entry found in the CV (most recent first) — each entry as a single readable line combining the course/degree, institution, years, and grade/percentage if present (e.g. "Bachelor of Technology, Sanaka Educational Trust's Group of Institutions, 2018-2022, Grade: 8.1"). Use [] only when the CV genuinely contains no education. Output raw JSON only - no markdown, no commentary.`;

export function buildCvPrefillUserPrompt(
  questions: PrefillQuestion[],
  name?: string,
  hints?: CvPrefillHints,
): string {
  const maxChars = 300;
  const questionLines = questions
    .map((q, i) => `${i + 1}. [id: ${q.id}] ${q.question}`)
    .join("\n");

  return `You are a CV parser. You are given a candidate's CV, their known profile info, and a list of questions.${
    name ? `\nThe candidate's name is ${name}.` : ""
  }

For each question, extract a concise, first-person answer using information from
the CV AND the known profile info below.

${RULES(maxChars)}

Questions:
${questionLines}
${knownInfoBlock(hints)}

${JSON_INSTRUCTION}

The candidate's CV is attached as a file.`;
}

// Text variant: the CV text has already been extracted client-side and is
// embedded inline. Preferred over the file variant because the model reliably
// receives the content as plain text.
export function buildCvPrefillTextPrompt(
  questions: PrefillQuestion[],
  cvText: string,
  name?: string,
  hints?: CvPrefillHints,
): string {
  const maxChars = 300;
  // Guard the token budget for very long CVs.
  const clampedCv = cvText.length > 16000 ? cvText.slice(0, 16000) : cvText;
  const questionLines = questions
    .map((q, i) => `${i + 1}. [id: ${q.id}] ${q.question}`)
    .join("\n");

  return `You are a CV parser. Below is the text extracted from a candidate's CV, their known profile info, and a list of questions.${
    name ? `\nThe candidate's name is ${name}.` : ""
  }

For each question, extract a concise, first-person answer using information from
the CV text AND the known profile info below.

${RULES(maxChars)}

Questions:
${questionLines}
${knownInfoBlock(hints)}

${JSON_INSTRUCTION}

--- CV TEXT START ---
${clampedCv}
--- CV TEXT END ---`;
}
