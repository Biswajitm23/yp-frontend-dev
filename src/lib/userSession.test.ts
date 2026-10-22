import { describe, it, expect } from "vitest";
import { extractSessionId } from "./userSession";

// The backend's UserSession contract is not frozen yet, and the three auth
// endpoints that will carry the id do not even share an envelope: /auth/login
// and /auth/verify-otp nest under `data`, /social-login returns flat. These
// pin down that the extractor tolerates every shape it might legitimately see,
// and — just as important — that a response WITHOUT an id yields null instead
// of something truthy, because a missing id must never break a login.

describe("extractSessionId", () => {
  it("reads the id from a `data` envelope (login / verify-otp)", () => {
    expect(
      extractSessionId({ status: "OK", data: { session_id: "abc-123" } }),
    ).toBe("abc-123");
  });

  it("reads the id from a flat payload (social-login)", () => {
    expect(extractSessionId({ session_id: "flat-1", access: "t" })).toBe(
      "flat-1",
    );
  });

  it("prefers the enveloped id when both are present", () => {
    expect(
      extractSessionId({ session_id: "outer", data: { session_id: "inner" } }),
    ).toBe("inner");
  });

  it("accepts the snake_case and camelCase aliases", () => {
    expect(extractSessionId({ data: { user_session_id: "u-1" } })).toBe("u-1");
    expect(extractSessionId({ data: { sessionId: "c-1" } })).toBe("c-1");
  });

  it("accepts a nested session object", () => {
    expect(extractSessionId({ data: { session: { id: "n-1" } } })).toBe("n-1");
    expect(extractSessionId({ data: { user_session: { id: "n-2" } } })).toBe(
      "n-2",
    );
  });

  it("coerces a numeric primary key to a string", () => {
    expect(extractSessionId({ data: { session_id: 42 } })).toBe("42");
    expect(extractSessionId({ data: { session: { id: 7 } } })).toBe("7");
  });

  it("returns null when the backend has not shipped its half yet", () => {
    expect(extractSessionId({ status: "OK", data: { access_token: "t" } })).toBeNull();
  });

  it("returns null for empty, blank and non-object payloads", () => {
    expect(extractSessionId(null)).toBeNull();
    expect(extractSessionId(undefined)).toBeNull();
    expect(extractSessionId("nope")).toBeNull();
    expect(extractSessionId({ data: { session_id: "" } })).toBeNull();
    expect(extractSessionId({ data: { session_id: "   " } })).toBeNull();
  });

  it("ignores a non-finite numeric id rather than writing \"NaN\"", () => {
    expect(extractSessionId({ data: { session_id: NaN } })).toBeNull();
  });
});
