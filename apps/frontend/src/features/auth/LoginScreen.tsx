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
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loadingAction, setLoadingAction] = useState<"google" | "password" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showMobileOptions, setShowMobileOptions] = useState(false)

  const isLoading = loadingAction !== null

  async function signInWithGoogle() {
    setLoadingAction("google")
    setError(null)
    setNotice(null)
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
      setLoadingAction(null)
    }
  }

  async function submitPasswordAuth() {
    setLoadingAction("password")
    setError(null)
    setNotice(null)

    const normalizedEmail = email.trim()
    if (authMode === "signUp" && password !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"))
      setLoadingAction(null)
      return
    }

    setSessionPersistencePreference(rememberSession)

    try {
      const client = getSupabaseClient(rememberSession)
      if (authMode === "signIn") {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (signInError) {
          throw signInError
        }
      } else {
        const { data, error: signUpError } = await client.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
          },
        })

        if (signUpError) {
          throw signUpError
        }

        if (!data.session) {
          setNotice(t("auth.checkEmail"))
        }
      }
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setLoadingAction(null)
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
        {notice && (
          <p className="mt-6 rounded-xl border border-border-soft bg-surface-soft p-4 text-sm text-success-body">
            {notice}
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
          {loadingAction === "google" ? t("auth.openingGoogle") : t("auth.continueWithGoogle")}
        </button>

        <div className="my-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          <span className="h-px flex-1 bg-border-card" />
          <span>{t("auth.or")}</span>
          <span className="h-px flex-1 bg-border-card" />
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submitPasswordAuth()
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink" htmlFor="auth-email">
              {t("auth.email")}
            </label>
            <input
              autoComplete="username"
              className="w-full rounded-xl border border-border-card bg-page px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              required
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink" htmlFor="auth-password">
              {t("auth.password")}
            </label>
            <input
              autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-border-card bg-page px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
              id="auth-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              required
              type="password"
              value={password}
            />
          </div>
          {authMode === "signUp" && (
            <div>
              <label
                className="mb-2 block text-sm font-semibold text-ink"
                htmlFor="auth-confirm-password"
              >
                {t("auth.confirmPassword")}
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-xl border border-border-card bg-page px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
                id="auth-confirm-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                type="password"
                value={confirmPassword}
              />
            </div>
          )}
          <button
            className="flex w-full items-center justify-center rounded-xl border border-brand bg-transparent px-5 py-3.5 font-semibold text-brand transition hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {loadingAction === "password"
              ? authMode === "signIn"
                ? t("auth.signingIn")
                : t("auth.creatingAccount")
              : authMode === "signIn"
                ? t("auth.signInWithEmail")
                : t("auth.createAccount")}
          </button>
        </form>

        <button
          className="mt-4 w-full text-sm font-semibold text-brand underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={() => {
            setAuthMode((current) => (current === "signIn" ? "signUp" : "signIn"))
            setError(null)
            setNotice(null)
          }}
          type="button"
        >
          {authMode === "signIn" ? t("auth.createAccountPrompt") : t("auth.signInPrompt")}
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
