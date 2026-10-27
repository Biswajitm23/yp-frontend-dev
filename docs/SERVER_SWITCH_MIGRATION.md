# TEMP: Backend Migration — Runtime Server Switch (VM → Cloud Run)

> **This is a temporary, fully reversible change.** It lets the web app pick its
> backend base URL **at runtime** during the VM → Cloud Run migration, instead of
> reading one hardcoded `BACKEND_URL`. After cutover, revert everything in this
> doc and the codebase returns to exactly its prior state.
>
> **Find every touch point with:** `grep -rn "TEMP: backend migration" .`

---

## 1. What it does

All backend calls now read the base URL from a single helper, `getBackendUrl()`
(`src/lib/backendUrl.ts`), instead of `process.env.BACKEND_URL`. The helper
decides which server to use by calling a public switch endpoint.

**Decision logic — "Model A" (always ask the OLD server first):**

1. `GET {SERVER_1}/api/web/server-switch` (3s timeout).
2. Read `data.server`:
   - `true` → use **SERVER_1** (old — "stay")
   - `false` → use **SERVER_2** (new — "switch")
   - `"server 1"` / `"...1"` → use **SERVER_1** (legacy string form)
   - `"server 2"` / `"...2"` → use **SERVER_2** (legacy string form)
   - missing / unrecognised / error → treated as "no answer"
3. If SERVER_1 gave no usable answer → ask `GET {SERVER_2}/api/web/server-switch`
   (3s) as a backup, same rules.
4. If neither answers → reuse the **last-known-good** value; if none → **SERVER_1**.
5. The chosen URL is cached in **server memory for 60s** (shared across requests,
   not per-request) and stored as last-known-good. Concurrent cache-misses are
   collapsed into one resolution (no request stampede).

The switch is controlled entirely from the **old server's flag**:
`true` = everyone on old, `false` = everyone on new (takes effect within ~60s of
flipping it). Both responses (boolean and the legacy string) are handled, so a
format mismatch between the two servers cannot break anything. On any unexpected
response the app safely stays on the old server — it never crashes.

Nothing is exposed to the browser: `src/lib/backendUrl.ts` is `server-only` and
the URLs come from server-only env vars.

---

## 2. Env vars (server-only — never `NEXT_PUBLIC_*`)

Added to `.env.local` (and must be set the same way in the production/hosting
environment). **Bare origins only** — the app appends `/api/web/*` and
`/api/mobile/*` itself.

```
SERVER_1=https://admin.youngprofessionals.global
SERVER_2=https://yp-backend-776364212876.us-central1.run.app
```

`BACKEND_URL` is **left untouched** and acts as a safety fallback: if `SERVER_1`
is unset, the helper falls back to `BACKEND_URL`.

---

## 3. Files CREATED (2)

| File | Purpose |
|---|---|
| `src/lib/backendUrl.ts` | The entire switch logic (helper `getBackendUrl()`). Delete on revert. |
| `docs/SERVER_SWITCH_MIGRATION.md` | This document. Delete on revert. |

---

## 4. Files MODIFIED (16)

Every change is tagged `// TEMP: backend migration (VM -> Cloud Run) — remove after cutover`.
In each code file the original line is **commented out in place** (right next to
the new line) so revert is a straight un-comment.

**Pattern used in every file:** comment out the module-level
`const BACKEND = process.env.BACKEND_URL` (or `BASE` / `BACKEND_URL`), add
`import { getBackendUrl } from "@/lib/backendUrl";`, and resolve
`const BACKEND = await getBackendUrl();` at request time (inside the handler /
callback that uses it — the variable name is kept identical so nothing else in
the file changes).

| # | File | Original line (commented out) | New request-time line |
|---|---|---|---|
| 1 | `.env.local` | — (env additions only) | `SERVER_1=…`, `SERVER_2=…` added |
| 2 | `src/lib/api.ts` | `const BASE = process.env.BACKEND_URL!` | `const BASE = await getBackendUrl()` in `call()` **and** `refreshInline()` |
| 3 | `src/auth.ts` | `const BACKEND = process.env.BACKEND_URL` | `const BACKEND = await getBackendUrl()` in the `signIn` callback |
| 4 | `src/app/api/auth/login/route.ts` | `const BACKEND = …` | in `POST` |
| 5 | `src/app/api/auth/refresh/route.ts` | `const BACKEND = …` | in `POST` |
| 6 | `src/app/api/auth/me/route.ts` | `const BACKEND = …` | in `callBackendMe()` |
| 7 | `src/app/api/auth/logout/route.ts` | `const BACKEND = …` | in `POST` (inside the `if (access)` block) |
| 8 | `src/app/api/auth/signup/route.ts` | `const BACKEND = …` | in `POST` |
| 9 | `src/app/api/auth/signup_web/route.ts` | `const BACKEND = … \|\| ""` | in `POST` |
| 10 | `src/app/api/auth/social-login/route.ts` | `const BACKEND = …` | in `POST` |
| 11 | `src/app/api/auth/verify/route.ts` | `const BACKEND = …` | in `POST` |
| 12 | `src/app/api/auth/session/heartbeat/route.ts` | `const BACKEND = …` | in `POST` |
| 13 | `src/app/api/create-profile/route.ts` | `const BACKEND = …` | in `POST` (after `requireAuth`) |
| 14 | `src/app/api/contact-us-api/route.ts` | `const BACKEND_URL = …!` | `const BACKEND_URL = await getBackendUrl()` in `POST` |
| 15 | `src/app/api/event/confirm-payment/route.ts` | `const BACKEND = …` | in `POST` |
| 16 | `src/app/api/checkphonenumberAvailability/route.ts` | `const BACKEND = …!` (was inside `POST`) | `const BACKEND = await getBackendUrl()` in `POST` |

---

## 5. Intentionally NOT touched

- **`src/components/jobs/src/auth.ts`** — a stray/dead duplicate tree (its own
  `package.json`/`next.config.ts`; nothing imports it, it is not part of the
  build). Its `process.env.BACKEND_URL` never executes, so it is left as-is.
- **Media / image URLs** (`NEXT_PUBLIC_STORAGE_URL`, `storage.googleapis.com`),
  Google Maps, YouTube, social, and marketing links — not the backend API base.
- **`src/proxy.ts`** (middleware) — it calls the *internal* `/api/auth/refresh`
  route (which now uses the helper), not the backend directly. No change needed.

---

## 6. How to REVERT (back to exactly the current codebase)

1. List every touch point:
   ```
   grep -rn "TEMP: backend migration" .
   ```
2. In each **modified file**: delete the `// TEMP: …` lines, un-comment the
   original line sitting next to them, and remove the
   `import { getBackendUrl } from "@/lib/backendUrl";` line.
   - `src/lib/api.ts`: restore `const BASE = process.env.BACKEND_URL!;` at module
     scope and delete the two `const BASE = await getBackendUrl();` lines.
   - `src/app/api/checkphonenumberAvailability/route.ts`: restore
     `const BACKEND = process.env.BACKEND_URL!;` (it was inside `POST`).
3. Delete the created files:
   - `src/lib/backendUrl.ts`
   - `docs/SERVER_SWITCH_MIGRATION.md`
4. Remove `SERVER_1` and `SERVER_2` (and their comment block) from `.env.local`
   and the production env. Leave `BACKEND_URL` as it was.
5. Verify the revert is complete (should print nothing):
   ```
   grep -rn "TEMP: backend migration" .
   grep -rn "getBackendUrl" src
   ```
   Then run `npx tsc --noEmit` — it should pass as before.

After these steps the project is byte-for-byte what it was before the migration.
The **database is never touched** by any of this — only which URL requests go to.

---

## 7. How to test

Set the old server's flag via the backend, then reload the app (changes take
effect within ~60s due to the cache).

| Case | Setup | Expected |
|---|---|---|
| 1. Flag = server 1 | SERVER_1 switch returns `true` (or `"server 1"`) | App calls **old** server |
| 2. Flag = server 2 | SERVER_1 switch returns `false` (or `"server 2"`) | App calls **new** server |
| 3. Old down + flag server 2 | SERVER_1 unreachable; SERVER_2 switch returns `false`/`"server 2"` | Falls back to SERVER_2's answer → **new** server |
| 4. Both down | Neither switch endpoint answers | Uses **last-known-good**, else **SERVER_1** (old) |

Quick manual check of the endpoints:
```
curl -s https://admin.youngprofessionals.global/api/web/server-switch
curl -s https://yp-backend-776364212876.us-central1.run.app/api/web/server-switch
```

---

## 8. Cutover & operational notes

- **To migrate:** set the OLD server's `server-switch` flag to `false` → all web
  traffic moves to Cloud Run within ~60s. **To roll back:** set it to `true`.
- Keep the **OLD server running** throughout the migration — it is the control
  switch. Only ask it to go down *after* you have reverted this change and
  hardcoded `BACKEND_URL` to the new server.
- The 60s cache lives in per-instance server memory, so each server instance
  resolves independently — expect up to ~60s for a flag change to apply fleet-wide.
- Both servers share the same database and JWT secret, so users stay logged in
  across the switch.

---

## 9. ADDENDUM — `server` body field + "which server" toast (temporary)

Two additions on top of the runtime switch above. Both are temporary and tagged
`// TEMP: backend migration (VM -> Cloud Run) — remove after cutover`, so the
same grep finds them. **Nothing from the original codebase was changed, deleted,
or moved — these are purely additive.**

### 9a. Send `"server"` on the 5 session endpoints (Feature 2)

The backend wants to know which server the web is on for each session call. We
send it in the request **body** as a number: **`0` = SERVER_1 (old)**,
**`1` = SERVER_2 (new)**. The value comes from the SAME runtime choice every
other call uses (so it always matches the URL the request is sent to).

- **New helper** in `src/lib/backendUrl.ts`: `getBackendServerCode(): Promise<0|1>`
  — reads the cached `getBackendUrl()` result; returns `1` only when it equals
  `SERVER_2`, else `0` (matches the backend's "missing = 0").
- `"server"` added to the request body in:
  | Endpoint | File | How |
  |---|---|---|
  | login | `src/app/api/auth/login/route.ts` | `server:` added to `payload` |
  | signup | `src/app/api/auth/signup/route.ts` | `server:` added to body |
  | verify-otp | `src/app/api/auth/verify/route.ts` | `{ ...body, server }` |
  | social-login | `src/app/api/auth/social-login/route.ts` | `{ ...body, server }` |
  | heartbeat | `src/app/api/auth/session/heartbeat/route.ts` | `server:` added to body |
  | social (real path) | `src/auth.ts` | `server: serverCode` on the login, signup, and login-after-signup calls |

  Each of those files also had its import widened from `{ getBackendUrl }` to
  `{ getBackendUrl, getBackendServerCode }`.

### 9b. "Connected to Server N" toast (Feature 3)

A one-per-launch toast confirms which backend the switch resolved to, so we can
see the frontend is synced to the server the backend chose.

- **Created** `src/app/api/server-info/route.ts` — read-only `GET` that returns
  `{ data: { server: 0|1 } }` (the NUMBER only, never the URL).
- **Created** `src/components/commonUI/ServerSwitchToast.tsx` — client component,
  fetches `/api/server-info` once per launch and fires `toast.info("Connected to
  Server 1/2 …")` using the EXISTING react-toastify `ToastContainer` (no new
  styling). Renders `null`.
- **Mounted** in `src/app/layout.tsx` with one line (`<ServerSwitchToast />`)
  next to the existing `<ToastContainer>`, plus its import.

### 9c. How to revert 9a + 9b
1. `grep -rn "TEMP: backend migration" .` — delete the tagged lines added above
   and restore the widened imports back to `{ getBackendUrl }`.
2. Delete the 2 created files:
   - `src/app/api/server-info/route.ts`
   - `src/components/commonUI/ServerSwitchToast.tsx`
3. In `src/app/layout.tsx` remove the `<ServerSwitchToast />` line and its import.
4. Remove `getBackendServerCode` from `src/lib/backendUrl.ts` (or delete the whole
   file per §6 if reverting the entire migration).
