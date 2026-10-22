import { describe, it, expect } from "vitest";
import { groupComments, isAdminReply } from "./groupComments";

// Mirrors the real `POST user/feed/comments` payload: flat list, replies carry
// parent_id, and the reply can arrive BEFORE its parent in the array.
const parent = {
  id: "ak2GK7Hknpse_nfgsPPnaUg7sw==",
  parent_id: null,
  comment_text: "Hii please resolve my query",
  created_at: "2026-09-24T08:20:32.074600+00:00",
  author: { full_name: "Subham Das" },
};
const adminReply = {
  id: "EWOo1hJv6p9K-syzxo7WVhBfQA==",
  parent_id: "ak2GK7Hknpse_nfgsPPnaUg7sw==",
  comment_text: "Hii",
  created_at: "2026-09-24T08:24:43.148632+00:00",
  author: { full_name: "YOUNG-PRO  Admin" },
};

describe("groupComments", () => {
  it("returns [] for empty / invalid input", () => {
    expect(groupComments([])).toEqual([]);
    // @ts-expect-error runtime guard for non-array
    expect(groupComments(null)).toEqual([]);
  });

  it("attaches a reply to its parent even when the reply comes first", () => {
    const grouped = groupComments([adminReply, parent]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe(parent.id);
    expect(grouped[0].replies.map((r) => r.id)).toEqual([adminReply.id]);
  });

  it("keeps top-level comments flat with empty replies", () => {
    const other = { id: "KP0=", parent_id: null, comment_text: "Nice" };
    const grouped = groupComments([parent, other, adminReply]);
    expect(grouped.map((g) => g.id)).toEqual([parent.id, "KP0="]);
    expect(grouped[1].replies).toEqual([]);
  });

  it("flattens a reply-to-reply up to the top-level ancestor (one level deep)", () => {
    const replyToReply = {
      id: "r2==",
      parent_id: adminReply.id,
      comment_text: "nested",
      created_at: "2026-09-24T09:00:00+00:00",
    };
    const grouped = groupComments([parent, adminReply, replyToReply]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].replies.map((r) => r.id)).toEqual([
      adminReply.id,
      "r2==",
    ]);
  });

  it("keeps an orphan reply (missing parent) as its own top-level item", () => {
    const orphan = {
      id: "orphan==",
      parent_id: "does-not-exist==",
      comment_text: "lost",
    };
    const grouped = groupComments([orphan]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe("orphan==");
    expect(grouped[0].replies).toEqual([]);
  });

  it("sorts a parent's replies oldest-first", () => {
    const older = {
      id: "old==",
      parent_id: parent.id,
      created_at: "2026-09-24T08:22:00+00:00",
    };
    const newer = {
      id: "new==",
      parent_id: parent.id,
      created_at: "2026-09-24T08:30:00+00:00",
    };
    const grouped = groupComments([parent, newer, older]);
    expect(grouped[0].replies.map((r) => r.id)).toEqual(["old==", "new=="]);
  });
});

describe("isAdminReply", () => {
  it("treats any comment with a parent_id as an admin reply by default", () => {
    expect(isAdminReply(adminReply)).toBe(true);
    expect(isAdminReply(parent)).toBe(false);
  });

  it("honours an explicit backend flag when present", () => {
    expect(isAdminReply({ parent_id: "x", is_admin: false })).toBe(false);
    expect(isAdminReply({ parent_id: null, is_admin: true })).toBe(true);
    expect(isAdminReply({ parent_id: "x", role: "Admin" })).toBe(true);
  });
});
