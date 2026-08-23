import assert from "node:assert/strict"
import test from "node:test"
import { validateEnvironment } from "./config.js"

test("backend startup validation identifies every missing required environment variable", () => {
  assert.throws(
    () => validateEnvironment({}),
    new Error(
      "Missing required environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, GOOGLE_PLACES_API_KEY. " +
        "Configure them before starting the backend.",
    ),
  )
})

test("backend startup validation accepts all required environment variables", () => {
  assert.doesNotThrow(() =>
    validateEnvironment({
      GOOGLE_PLACES_API_KEY: "google-key",
      SUPABASE_PUBLISHABLE_KEY: "supabase-key",
      SUPABASE_URL: "https://example.supabase.co",
    }),
  )
})
