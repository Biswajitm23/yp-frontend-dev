"use client";

// Thin hook around the CV pre-fill service. Returns the { questionId: answer }
// map on success, or null on any failure (so the modal silently falls back to
// the manual flow). Exposes a status for the "Reading your CV…" state.

import { useCallback, useRef, useState } from "react";
import {
  parseCvToAnswers,
  type PrefillQuestion,
  type CvPrefillHints,
  type CvParseResult,
} from "@/services/cvPrefill.services";

export type PrefillStatus = "idle" | "parsing" | "done" | "error";

export function useCvPrefill() {
  const [status, setStatus] = useState<PrefillStatus>("idle");
  const inFlight = useRef(false);

  const prefill = useCallback(
    async (
      resumeUrl: string,
      questions: PrefillQuestion[],
      name?: string,
      hints?: CvPrefillHints,
    ): Promise<CvParseResult | null> => {
      if (!resumeUrl || !resumeUrl.trim() || questions.length === 0) return null;
      if (inFlight.current) return null;
      inFlight.current = true;
      setStatus("parsing");
      try {
        const result = await parseCvToAnswers(resumeUrl, questions, name, hints);
        setStatus("done");
        return result;
      } catch (err) {
        console.error("[useCvPrefill] parse failed:", err);
        setStatus("error");
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  return { status, prefill };
}
