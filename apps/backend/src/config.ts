const requiredEnvironmentNames = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "GOOGLE_PLACES_API_KEY",
] as const

export function validateEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const missingEnvironmentNames = requiredEnvironmentNames.filter(
    (name) => !environment[name]?.trim(),
  )

  if (missingEnvironmentNames.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingEnvironmentNames.join(", ")}. ` +
        "Configure them before starting the backend.",
    )
  }
}
