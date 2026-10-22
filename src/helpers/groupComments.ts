/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * groupComments — DISPLAY-ONLY grouping for the post comment section.
 *
 * The backend (`POST user/feed/comments`) returns a FLAT list of comments.
 * Replies are NOT nested — a reply is just a normal comment that carries a
 * `parent_id` pointing at the comment it answers. There is no explicit admin
 * flag today, so any comment with a `parent_id` is treated as an admin reply
 * (see `isAdminReply`).
 *
 * This helper keeps the source list untouched and derives a grouped VIEW for
 * rendering only, so the existing add/delete/optimistic comment logic that
 * operates on the flat array stays valid.
 *
 * Rules (locked to match the mobile app):
 *   1. Split the flat list: parent_id === null → top-level; parent_id set → reply.
 *   2. Attach each reply to its parent by String(reply.parent_id) === String(parent.id).
 *   3. One level deep only — a reply-to-reply is flattened up to the top-level
 *      ancestor (LinkedIn style).
 *   4. If a reply's parent isn't in the current list, keep it as its own
 *      top-level item so it's never lost (orphan fallback).
 *   5. Replies under each parent are sorted OLDEST-FIRST.
 *
 * IDs are base64-like strings (may contain "=" / "=="), so they are always
 * compared as strings.
 */

export interface RawComment {
  id?: string;
  _id?: string;
  _tempId?: string;
  parent_id?: string | null;
  created_at?: string | number | null;
  // Optional flags the backend may add later; honoured if present.
  is_admin?: boolean;
  is_author?: boolean;
  role?: string;
  author?: {
    id?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface GroupedComment extends RawComment {
  /** Admin replies attached to this top-level comment, oldest first. */
  replies: RawComment[];
}

/** Stable string id for a comment (never throws on missing fields). */
export const commentId = (c: RawComment | undefined): string =>
  c ? String(c.id ?? c._id ?? c._tempId ?? "") : "";

/** A comment is a reply when it carries a non-empty parent_id. */
const parentIdOf = (c: RawComment): string => {
  const p = c?.parent_id;
  return p === null || p === undefined || p === "" ? "" : String(p);
};

/** Epoch millis for sorting; unknown/invalid dates sort as oldest (0). */
const timeOf = (c: RawComment): number => {
  const raw = c?.created_at;
  if (raw === null || raw === undefined || raw === "") return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Whether a reply should render with the grey "Admin" badge.
 * Defaults to true for every reply (no admin flag exists yet); honours explicit
 * backend flags when they arrive.
 */
export const isAdminReply = (c: RawComment): boolean => {
  if (typeof c?.is_admin === "boolean") return c.is_admin;
  if (typeof c?.is_author === "boolean") return c.is_author;
  if (typeof c?.role === "string") return c.role.toLowerCase() === "admin";
  // No explicit flag → any reply (has a parent) is treated as an admin reply.
  return parentIdOf(c) !== "";
};

/**
 * Walk up the parent chain to the top-level ancestor's id (rule #3).
 * Returns the comment's own id when it is top-level or an orphan (rule #4).
 */
const resolveRootId = (
  c: RawComment,
  byId: Map<string, RawComment>,
): string => {
  let current = c;
  const seen = new Set<string>([commentId(current)]);
  // Guard against cycles and missing links.
  while (parentIdOf(current) !== "") {
    const parent = byId.get(parentIdOf(current));
    if (!parent) break; // parent not in current list → orphan / best-effort root
    const pid = commentId(parent);
    if (seen.has(pid)) break; // cycle
    seen.add(pid);
    current = parent;
  }
  return commentId(current);
};

/**
 * Group a flat comment list into top-level comments each carrying their
 * (admin) replies. Top-level ordering follows first appearance in the input,
 * so it inherits whatever order the API returned (recent-first, etc.).
 */
export function groupComments(comments: RawComment[]): GroupedComment[] {
  if (!Array.isArray(comments) || comments.length === 0) return [];

  const byId = new Map<string, RawComment>();
  for (const c of comments) {
    const cid = commentId(c);
    if (cid) byId.set(cid, c);
  }

  const groups = new Map<string, GroupedComment>();
  const order: string[] = [];
  const pendingReplies: RawComment[] = [];

  // Pass 1: establish roots (top-level comments + orphan replies) in order.
  for (const c of comments) {
    const rootId = resolveRootId(c, byId);
    const isRoot = rootId === commentId(c) || rootId === "";
    if (isRoot) {
      const key = commentId(c) || `__idx_${order.length}`;
      if (!groups.has(key)) {
        groups.set(key, { ...c, replies: [] });
        order.push(key);
      }
    } else {
      pendingReplies.push(c);
    }
  }

  // Pass 2: attach replies to their resolved root (orphans handled as roots above).
  for (const reply of pendingReplies) {
    const rootId = resolveRootId(reply, byId);
    const group = groups.get(rootId);
    if (group) {
      group.replies.push(reply);
    } else {
      // Root wasn't materialised (defensive) — surface the reply top-level.
      const key = commentId(reply) || `__idx_${order.length}`;
      if (!groups.has(key)) {
        groups.set(key, { ...reply, replies: [] });
        order.push(key);
      }
    }
  }

  // Sort each parent's replies oldest-first (rule #5).
  const result: GroupedComment[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    group.replies.sort((a, b) => timeOf(a) - timeOf(b));
    result.push(group);
  }
  return result;
}

export default groupComments;
