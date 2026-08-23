import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { getErrorMessage } from "./lib/errors"
import { getSupabaseClient } from "./lib/supabase"
import { LoadingCover } from "./components/LoadingCover"
import { SeoMetadata } from "./components/SeoMetadata"
import { LoginScreen } from "./features/auth/LoginScreen"
import { TripAccessRequestScreen } from "./features/trips/TripAccessRequestScreen"
import { TripDashboard } from "./features/trips/TripDashboard"

function removeEmptyUrlHash() {
  const currentUrl = new URL(window.location.href)

  if (currentUrl.hash === "" && window.location.href.endsWith("#")) {
    window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}`)
  }
}

function LegacySpreadsheetRedirect() {
  const { tripId } = useParams<{ tripId: string }>()
  return <Navigate replace to={tripId ? `/trips/${tripId}` : "/"} />
}

export default function App() {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let unsubscribe = () => {}

    async function initializeAuth() {
      try {
        const client = getSupabaseClient()
        const { data, error } = await client.auth.getSession()

        if (error) {
          throw error
        }

        removeEmptyUrlHash()

        if (isMounted) {
          setSession(data.session)
          setIsAuthReady(true)
        }

        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (isMounted) {
            setSession(nextSession)
          }
        })
        unsubscribe = () => subscription.unsubscribe()
      } catch (reason: unknown) {
        if (isMounted) {
          setAuthError(getErrorMessage(reason))
          setIsAuthReady(true)
        }
      }
    }

    void initializeAuth()

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  if (!isAuthReady) {
    return <LoadingCover fullScreen message={t("common.loading")} />
  }

  if (authError) {
    return (
      <main className="grid min-h-screen place-items-center bg-page px-5 text-center text-error">
        <p className="max-w-md rounded-2xl border border-danger-border bg-error-surface p-5">
          {authError}
        </p>
      </main>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return (
    <>
      <SeoMetadata />
      <Routes>
        <Route
          element={<TripAccessRequestScreen accessToken={session.access_token} />}
          path="/trips/:tripId/request-access"
        />
        <Route element={<TripDashboard session={session} />} path="/" />
        <Route element={<TripDashboard session={session} />} path="/trips/:tripId" />
        <Route element={<TripDashboard session={session} />} path="/trips/:tripId/travel" />
        <Route element={<TripDashboard session={session} />} path="/trips/:tripId/backup" />
        <Route element={<TripDashboard session={session} />} path="/trips/:tripId/map" />
        <Route element={<LegacySpreadsheetRedirect />} path="/trips/:tripId/spreadsheet" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </>
  )
}
