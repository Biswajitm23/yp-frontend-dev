"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateProfile } from "@/app/hooks/useUpdateProfile";
import { USER_PROFILE_QUERY_KEY } from "@/app/hooks/useUserProfile";
import {
  buildResumeRemovePayload,
  buildResumeUploadFormData,
  type ProfileLike,
} from "./profileFormMapper";
import { resumeNameFromUrl, validateResumeFile } from "./resumeValidation";

export type ResumeStatus =
  | "idle"
  | "selected"
  | "uploading"
  | "saved"
  | "error";

interface UseResumeFieldArgs {
  /** The current profile object (source of truth for an existing resume). */
  user: ProfileLike;
  /** Optimistic cache write-through, mirrors the other profile cards. */
  onUpdated?: (patch: Record<string, unknown>) => void;
}

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * Owns the resume field's local state and the two profile-update calls
 * (upload via multipart, remove via JSON). The UI stays declarative — it reads
 * `status`, `resumeName`, `pendingSelection`, etc. and calls the actions.
 */
export function useResumeField({ user, onUpdated }: UseResumeFieldArgs) {
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs created for in-tab viewing — revoked on unmount.
  const objectUrls = useRef<string[]>([]);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Kept after a successful upload so the filename + View work immediately,
  // even before a full profile refetch returns the stored URL.
  const [savedFile, setSavedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ResumeStatus>("idle");

  // Treat a blank/whitespace-only value as "no CV": after a removal the
  // resume_url can be empty (or briefly a placeholder from the optimistic
  // update), and that must never count as an existing resume.
  const existingUrlRaw = user?.resume_url ?? user?.resume ?? null;
  const existingUrl: string | null =
    existingUrlRaw && String(existingUrlRaw).trim() ? existingUrlRaw : null;

  useEffect(
    () => () => {
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const resumeName = useMemo(() => {
    if (selectedFile) return selectedFile.name;
    if (savedFile) return savedFile.name;
    if (existingUrl) return resumeNameFromUrl(existingUrl);
    return null;
  }, [selectedFile, savedFile, existingUrl]);

  const hasResume = Boolean(selectedFile || savedFile || existingUrl);
  const pendingSelection = Boolean(selectedFile);
  const isBusy = status === "uploading";

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    setStatus("idle");
  }, []);

  // Validate + stage a file. Shared by the file input and drag-and-drop.
  const selectFile = useCallback((file: File) => {
    const result = validateResumeFile(file);
    if (!result.valid) {
      setError(result.error ?? "Invalid file");
      setStatus("error");
      toast.error(result.error ?? "Invalid file");
      return;
    }
    setSelectedFile(file);
    setError(null);
    setStatus("selected");
  }, []);

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so selecting the same file again re-fires change.
      e.target.value = "";
      if (file) selectFile(file);
    },
    [selectFile],
  );

  // Returns the CV url to preview (a fresh object URL for a local file, or the
  // stored resume url). The caller opens it in the in-app modal.
  const view = useCallback((): string | null => {
    const file = selectedFile ?? savedFile;
    if (file) {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      return url;
    }
    return existingUrl;
  }, [selectedFile, savedFile, existingUrl]);

  const save = useCallback(async () => {
    if (!selectedFile) return;
    setStatus("uploading");
    setError(null);
    try {
      const formData = buildResumeUploadFormData(user, selectedFile);
      await updateProfile.mutateAsync(formData);
      // Refetch the profile so the stored resume_url is available immediately
      // (e.g. the summary builder's CV pre-fill sees it without a page refresh).
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });

      setSavedFile(selectedFile);
      setSelectedFile(null);
      setStatus("saved");
      toast.success("Resume uploaded");

      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      // Preserve the local selection so the user can retry.
      const message = errorMessage(err, "Failed to upload resume");
      setStatus("error");
      setError(message);
      toast.error(message);
    }
  }, [selectedFile, user, updateProfile, queryClient]);

  const remove = useCallback(async () => {
    // A locally-selected (unsaved) file with no stored resume → just discard.
    if (selectedFile && !savedFile && !existingUrl) {
      clearSelection();
      return;
    }

    setStatus("uploading");
    setError(null);
    try {
      await updateProfile.mutateAsync(buildResumeRemovePayload(user));
      // Refetch the profile so the cleared resume_url is reflected from the
      // backend (not just optimistically), confirming the removal persisted.
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      setSavedFile(null);
      setSelectedFile(null);
      setStatus("idle");
      onUpdated?.({ resume: null, resume_url: " " });
      toast.success("Resume removed");
    } catch (err) {
      const message = errorMessage(err, "Failed to remove resume");
      setStatus("error");
      setError(message);
      toast.error(message);
    }
  }, [selectedFile, savedFile, existingUrl, user, updateProfile, onUpdated, clearSelection, queryClient]);

  return {
    fileInputRef,
    status,
    error,
    resumeName,
    hasResume,
    pendingSelection,
    isBusy,
    openFilePicker,
    onFileChange,
    selectFile,
    clearSelection,
    view,
    save,
    remove,
  };
}
