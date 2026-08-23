import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readMigratedStorageValue, storageKeys } from "./brand"
import { validateFrontendEnvironment } from "./config"

const persistencePreferenceKey = storageKeys.rememberSession

function getSupabaseConfig() {
  validateFrontendEnvironment()

  return {
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    url: import.meta.env.VITE_SUPABASE_URL,
  }
}

function getStoredPersistencePreference(): boolean {
  return (
    readMigratedStorageValue(persistencePreferenceKey, storageKeys.legacyRememberSession) !==
    "false"
  )
}

let client: SupabaseClient | null = null
let clientPersistence: boolean | null = null

export function setSessionPersistencePreference(rememberSession: boolean) {
  window.localStorage.setItem(persistencePreferenceKey, String(rememberSession))
}

export function getSupabaseClient(
  rememberSession = getStoredPersistencePreference(),
): SupabaseClient {
  if (client && clientPersistence === rememberSession) {
    return client
  }

  const { url, publishableKey } = getSupabaseConfig()
  client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: rememberSession,
      storage: rememberSession ? window.localStorage : window.sessionStorage,
    },
  })
  clientPersistence = rememberSession

  return client
}
