import { describe, it, expect } from "vitest";
import {
  buildClientHeaders,
  isValidDeviceId,
  newDeviceId,
  readDeviceId,
  serializeDeviceCookie,
  DEVICE_ID_COOKIE,
} from "./clientMeta";

/** Stand-in for `cookies()` / `NextRequest.cookies`. */
function jar(values: Record<string, string>) {
  return {
    get: (name: string) =>
      name in values ? { value: values[name] } : undefined,
  };
}

/** Stand-in for `headers()` / `Request.headers`. */
function bag(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

const VALID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("isValidDeviceId", () => {
  it("accepts a UUID", () => {
    expect(isValidDeviceId(VALID)).toBe(true);
    expect(isValidDeviceId(newDeviceId())).toBe(true);
  });

  // The cookie is client-readable, so anything that is not a UUID is a
  // hand-edited or truncated value and must not reach the analytics table.
  it("rejects junk, truncation and non-strings", () => {
    expect(isValidDeviceId("")).toBe(false);
    expect(isValidDeviceId("not-a-uuid")).toBe(false);
    expect(isValidDeviceId(VALID.slice(0, 20))).toBe(false);
    expect(isValidDeviceId(`${VALID}; evil=1`)).toBe(false);
    expect(isValidDeviceId(undefined)).toBe(false);
    expect(isValidDeviceId(123)).toBe(false);
  });
});

describe("newDeviceId", () => {
  it("mints distinct v4 UUIDs", () => {
    const a = newDeviceId();
    const b = newDeviceId();
    expect(a).not.toBe(b);
    expect(a[14]).toBe("4"); // version nibble
  });
});

describe("readDeviceId", () => {
  it("returns the id when the cookie holds a UUID", () => {
    expect(readDeviceId(jar({ [DEVICE_ID_COOKIE]: VALID }))).toBe(VALID);
  });

  it("returns null for an absent, invalid or unreadable jar", () => {
    expect(readDeviceId(jar({}))).toBeNull();
    expect(readDeviceId(jar({ [DEVICE_ID_COOKIE]: "junk" }))).toBeNull();
    expect(readDeviceId(null)).toBeNull();
    expect(
      readDeviceId({
        get() {
          throw new Error("no jar here");
        },
      }),
    ).toBeNull();
  });
});

describe("buildClientHeaders", () => {
  it("always reports platform and version, even with no request context", () => {
    const h = buildClientHeaders();
    expect(h["X-Client-Platform"]).toBe("web");
    expect(h["X-Client-Version"]).toBeTruthy();
  });

  it("attaches the device id from the cookie jar", () => {
    const h = buildClientHeaders(jar({ [DEVICE_ID_COOKIE]: VALID }));
    expect(h["X-Device-Id"]).toBe(VALID);
  });

  it("omits X-Device-Id rather than sending a bad one", () => {
    const h = buildClientHeaders(jar({ [DEVICE_ID_COOKIE]: "junk" }));
    expect(h).not.toHaveProperty("X-Device-Id");
  });

  // This is what stops the backend recording THIS server's address and undici's
  // user agent on every UserSession row.
  it("forwards the browser's user agent and originating IP", () => {
    const h = buildClientHeaders(
      jar({ [DEVICE_ID_COOKIE]: VALID }),
      bag({
        "user-agent": "Mozilla/5.0 (Test)",
        "x-forwarded-for": "203.0.113.7, 70.41.3.18",
        "x-real-ip": "203.0.113.7",
      }),
    );
    expect(h["User-Agent"]).toBe("Mozilla/5.0 (Test)");
    expect(h["X-Forwarded-For"]).toBe("203.0.113.7, 70.41.3.18");
    expect(h["X-Real-IP"]).toBe("203.0.113.7");
  });

  it("omits the forwarding headers when there is no proxy in front (local dev)", () => {
    const h = buildClientHeaders(jar({}), bag({}));
    expect(h).not.toHaveProperty("X-Forwarded-For");
    expect(h).not.toHaveProperty("User-Agent");
  });

  it("survives a header bag that throws", () => {
    const h = buildClientHeaders(jar({ [DEVICE_ID_COOKIE]: VALID }), {
      get() {
        throw new Error("outside request scope");
      },
    });
    expect(h["X-Client-Platform"]).toBe("web");
    expect(h["X-Device-Id"]).toBe(VALID);
  });
});

describe("serializeDeviceCookie", () => {
  it("emits a year-long, path-wide, lax cookie", () => {
    const c = serializeDeviceCookie(VALID);
    expect(c).toContain(`${DEVICE_ID_COOKIE}=${VALID}`);
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=31536000");
    expect(c).toContain("SameSite=Lax");
  });

  // Not httpOnly on purpose — DeviceIdSync mirrors it into localStorage for
  // parity with the mobile clients. It identifies a browser, never authenticates
  // one, so there is nothing here to steal.
  it("is readable by client JS", () => {
    expect(serializeDeviceCookie(VALID)).not.toContain("HttpOnly");
  });
});
