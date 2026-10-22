import "server-only";
import OpenAI from "openai";

// Server-only OpenAI client. The API key lives ONLY in server env and never
// reaches the browser (that's the whole point of these routes — previously the
// key was shipped to the client via NEXT_PUBLIC_OPENAI_API_KEY + a browser
// OpenAI client, so it showed up as an `Authorization: Bearer` header in
// DevTools). `import "server-only"` makes this module impossible to import from
// a client bundle.
//
// Env: set `OPENAI_API_KEY` (NOT `NEXT_PUBLIC_…`). The NEXT_PUBLIC fallback is
// only a transition convenience — once OPENAI_API_KEY is set you can (and
// should) delete the NEXT_PUBLIC one so it is no longer bundled anywhere.
let client: OpenAI | null = null;

export function getServerOpenAI(): OpenAI {
  if (!client) {
    const apiKey =
      process.env.OPENAI_API_KEY ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY ||
      "";
    client = new OpenAI({ apiKey });
  }
  return client;
}

// The AI routes only proxy these models, so a valid session can't be used to
// run the proxy against arbitrary/expensive models.
export const ALLOWED_AI_MODELS = new Set<string>([
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-3.5-turbo",
]);

export function isAllowedModel(model: unknown): model is string {
  return typeof model === "string" && ALLOWED_AI_MODELS.has(model);
}
