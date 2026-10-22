// Word-safe streaming helpers.
//
// When the AI streams a summary token-by-token, a raw chunk can arrive
// mid-word ("Pursu…") or mid-markdown ("**Bol…"). Showing that verbatim looks
// like a spelling mistake. These pure helpers compute the largest prefix of the
// accumulated text that is safe to display right now — always ending on a
// completed word and never inside an unclosed **bold** run. The held-back tail
// is revealed on the next chunk (or when the stream ends and the full,
// already-complete text is shown).

/**
 * Strip a leading Markdown code fence the model sometimes wraps output in
 * (```json / ```markdown / ```). Only the OPENING fence — the closing one is
 * handled by the final full-text parse.
 */
export function stripLeadingFence(text: string): string {
  return text.replace(/^\s*```(?:json|markdown|md)?[ \t]*\r?\n?/i, "");
}

/**
 * Largest prefix of `text` that is safe to render during streaming:
 *  1. Cut at the last whitespace so the in-progress final word is held back.
 *  2. If that prefix contains an unclosed `**` (odd count), cut before it so a
 *     stray `**` is never rendered as literal asterisks.
 *
 * Returns "" while only a single partial word has arrived (nothing safe yet).
 */
export function safeStreamPrefix(text: string): string {
  if (!text) return "";

  const lastWs = Math.max(
    text.lastIndexOf(" "),
    text.lastIndexOf("\n"),
    text.lastIndexOf("\t"),
  );
  let end = lastWs === -1 ? 0 : lastWs + 1;

  const prefix = text.slice(0, end);
  const boldMarkers = (prefix.match(/\*\*/g) ?? []).length;
  if (boldMarkers % 2 === 1) {
    const lastOpen = prefix.lastIndexOf("**");
    end = lastOpen < 0 ? 0 : lastOpen;
  }

  return text.slice(0, end);
}
