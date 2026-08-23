import { useState } from "react"
import { useTranslation } from "react-i18next"
import { getSupabaseClient, setSessionPersistencePreference } from "../../lib/supabase"
import { getErrorMessage } from "../../lib/errors"
import { LanguageSwitcher } from "../../components/LanguageSwitcher"
import { MobileMenuButton } from "../../components/MobileMenuButton"
import { ThemeToggle } from "../../components/ThemeToggle"
import { TurprepLogo } from "../../components/TurprepLogo"
import { PRODUCT_NAME } from "../../lib/brand"

function getAuthRedirectUrl() {
  const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim()
  const appOrigin = configuredAppUrl || window.location.origin

  return new URL(
    `${window.location.pathname}${window.location.search}`,
    appOrigin.endsWith("/") ? appOrigin : `${appOrigin}/`,
  ).toString()
}

export function LoginScreen() {
  const { t } = useTranslation()
  const [rememberSession, setRememberSession] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMobileOptions, setShowMobileOptions] = useState(false)

  async function signInWithGoogle() {
    setIsLoading(true)
    setError(null)
    setSessionPersistencePreference(rememberSession)

    try {
      const client = getSupabaseClient(rememberSession)
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl(),
        },
      })

      if (signInError) {
        throw signInError
      }
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-[2rem] border border-border-card bg-surface p-7 shadow-card sm:p-10 lg:min-w-[42rem]">
        <div className="mb-8 font-semibold tracking-tight text-brand sm:mb-12">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TurprepLogo className="size-10" />
              <span>{PRODUCT_NAME}</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <MobileMenuButton
              closeLabel={t("common.close")}
              isOpen={showMobileOptions}
              menuLabel={t("common.menu")}
              onToggle={() => setShowMobileOptions((current) => !current)}
              openLabel={t("auth.openOptions")}
            />
          </div>
          {showMobileOptions && (
            <div className="mt-3 flex justify-end gap-2 border-t border-border-card pt-3 sm:hidden">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          )}
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-text">
          {t("auth.tagline")}
        </p>
        <h1 className="mt-4 text-4xl font-medium leading-tight tracking-[-0.04em] text-brand">
          {t("auth.heading")}
        </h1>
        <p className="mt-5 leading-7 text-muted">{t("auth.description")}</p>

        {error && (
          <p className="mt-6 rounded-xl border border-danger-border bg-error-surface p-4 text-sm text-error">
            {error}
          </p>
        )}

        <button
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-brand-surface px-5 py-3.5 font-semibold text-on-brand transition hover:bg-brand-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={() => void signInWithGoogle()}
          type="button"
        >
          <span className="grid size-6 place-items-center rounded-full bg-white text-sm font-bold text-google-blue">
            G
          </span>
          {isLoading ? t("auth.openingGoogle") : t("auth.continueWithGoogle")}
        </button>

        <label className="mt-5 flex items-center gap-3 text-sm text-muted">
          <input
            checked={rememberSession}
            className="size-4 accent-brand"
            onChange={(event) => setRememberSession(event.target.checked)}
            type="checkbox"
          />
          <span>{t("auth.rememberMe")}</span>
        </label>
      </section>
    </main>
  )
}
