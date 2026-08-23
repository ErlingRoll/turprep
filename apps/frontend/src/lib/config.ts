const requiredEnvironmentNames = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_GOOGLE_MAPS_API_KEY",
] as const

export function validateFrontendEnvironment(environment: ImportMetaEnv = import.meta.env) {
  const missingEnvironmentNames = requiredEnvironmentNames.filter(
    (name) => !environment[name]?.trim(),
  )

  if (missingEnvironmentNames.length > 0) {
    throw new Error(
      `Missing required frontend environment variable(s): ${missingEnvironmentNames.join(", ")}. ` +
        "Configure them before starting the frontend.",
    )
  }
}

validateFrontendEnvironment()
