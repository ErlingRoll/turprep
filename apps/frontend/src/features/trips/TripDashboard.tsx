import { useEffect, useMemo, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { deleteTrip, getTrip, getTrips, type Trip, type TripDetail } from "../../api"
import { getErrorMessage } from "../../lib/errors"
import { formatDateRange } from "../../lib/date-format"
import { getSupabaseClient } from "../../lib/supabase"
import { TripDetails } from "./TripDetails"
import { TripBackupPage } from "./TripBackupPage"
import { TripMapPage } from "./TripMapPage"
import { TripSpreadsheetPage } from "./TripSpreadsheetPage"
import { TripForm } from "./TripForm"
import { TravelMode } from "./TravelMode"
import { useTripRealtime } from "./useTripRealtime"
import { useTripDaySelection } from "./useTripDaySelection"
import { LanguageSwitcher } from "../../components/LanguageSwitcher"
import { MobileMenuButton } from "../../components/MobileMenuButton"
import { ThemeToggle } from "../../components/ThemeToggle"
import { PRODUCT_NAME, storageKeys } from "../../lib/brand"

type TripDashboardProps = {
  session: Session
}

function getInitialShowItemDetails() {
  return window.localStorage.getItem(storageKeys.showItemDetails) !== "false"
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")
    const updateDesktopState = () => setIsDesktop(mediaQuery.matches)

    updateDesktopState()
    mediaQuery.addEventListener("change", updateDesktopState)

    return () => mediaQuery.removeEventListener("change", updateDesktopState)
  }, [])

  return isDesktop
}

export function TripDashboard({ session }: TripDashboardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { tripId } = useParams<{ tripId: string }>()
  const isTravelMode = location.pathname.endsWith("/travel")
  const isBackupMode = location.pathname.endsWith("/backup")
  const isMapMode = location.pathname.endsWith("/map")
  const isPlanMode = !isTravelMode && !isBackupMode && !isMapMode
  const hasValidTripId = Boolean(tripId && tripId !== ":tripId")
  const isDesktop = useIsDesktop()
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [showMobileOptions, setShowMobileOptions] = useState(false)
  const [showItemDetails, setShowItemDetails] = useState(getInitialShowItemDetails)
  const [isDesktopReordering, setIsDesktopReordering] = useState(false)
  const [isPreferenceSaving, setIsPreferenceSaving] = useState(false)
  const daySelection = useTripDaySelection(selectedTrip)

  useEffect(() => {
    window.localStorage.setItem(storageKeys.showItemDetails, String(showItemDetails))
  }, [showItemDetails])

  useEffect(() => {
    let isMounted = true

    getTrips(session.access_token)
      .then((loadedTrips) => {
        if (!isMounted) {
          return
        }
        setTrips(loadedTrips)
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [session.access_token])

  useEffect(() => {
    if (!tripId || tripId === ":tripId") {
      setSelectedTrip(null)
      setDetailsError(null)
      return
    }

    let isMounted = true
    setIsDetailsLoading(true)
    setDetailsError(null)

    getTrip(session.access_token, tripId)
      .then((trip) => {
        if (isMounted) {
          setSelectedTrip(trip)
        }
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setDetailsError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsDetailsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [hasValidTripId, tripId, session.access_token])

  useEffect(() => {
    if (tripId === ":tripId") {
      navigate("/", { replace: true })
    }
  }, [navigate, tripId])

  useTripRealtime({
    accessToken: session.access_token,
    isPaused: () => isDesktopReordering || isPreferenceSaving,
    onError: setDetailsError,
    onTripUpdated: handleTripUpdated,
    tripId:
      hasValidTripId &&
      (isTravelMode || isBackupMode || isMapMode || (isPlanMode && isDesktop))
        ? tripId
        : undefined,
  })

  const filteredTrips = useMemo(() => {
    const query = search.trim().toLowerCase()
    return trips.filter((trip) => trip.name.toLowerCase().includes(query))
  }, [search, trips])

  async function signOut() {
    await getSupabaseClient().auth.signOut()
  }

  function handleCreated(trip: Trip) {
    setTrips((currentTrips) => [trip, ...currentTrips])
    navigate(`/trips/${trip.id}`)
    setIsCreating(false)
  }

  function handleOpenMap(itemType: "activity" | "meal", itemId: string) {
    navigate(`/trips/${tripId}/map?focus=${itemType}:${itemId}`)
  }

  function handleTripUpdated(updatedTrip: TripDetail) {
    setSelectedTrip(updatedTrip)
    setTrips((currentTrips) =>
      currentTrips.map((trip) =>
        trip.id === updatedTrip.id
          ? {
              id: updatedTrip.id,
              name: updatedTrip.name,
              startDate: updatedTrip.startDate,
              endDate: updatedTrip.endDate,
              notes: updatedTrip.notes,
            }
          : trip,
      ),
    )
  }

  function goBackToOverview() {
    navigate("/", { replace: true })
  }

  async function handleDeleteTrip(trip: TripDetail) {
    setError(null)

    try {
      await deleteTrip(session.access_token, trip.id)
      const remainingTrips = trips.filter((currentTrip) => currentTrip.id !== trip.id)
      setTrips(remainingTrips)

      if (tripId === trip.id) {
        setSelectedTrip(null)
        navigate("/", { replace: true })
      }
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    }
  }

  function renderTripDetails() {
    return (
      <TripDetails
        accessToken={session.access_token}
        error={detailsError}
        isLoading={isDetailsLoading}
        onTripDeleted={handleDeleteTrip}
        onTripUpdated={handleTripUpdated}
        trip={selectedTrip}
        userId={session.user.id}
        daySelection={daySelection}
        showDetails={showItemDetails}
      />
    )
  }

  if (isMapMode) {
    return (
      <main className="h-dvh overflow-hidden bg-page text-ink">
        {selectedTrip ? (
          <TripMapPage
            accessToken={session.access_token}
            fullScreen
            onTripUpdated={handleTripUpdated}
            trip={selectedTrip}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-sm text-muted">
            {isDetailsLoading ? t("common.loadingTrip") : detailsError}
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-page text-ink">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="flex items-center gap-3 font-semibold tracking-tight text-brand" to="/">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-surface text-lg text-on-brand">
            ✦
          </span>
          <span>{PRODUCT_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-3 sm:flex">
            <ThemeToggle />
            <LanguageSwitcher />
            <span className="hidden max-w-48 truncate text-sm text-muted md:block">
              {session.user.email}
            </span>
            <button
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold transition hover:border-brand"
              onClick={() => void signOut()}
              type="button"
            >
              {t("dashboard.logOut")}
            </button>
          </div>
          <MobileMenuButton
            closeLabel={t("common.close")}
            isOpen={showMobileOptions}
            menuLabel={t("common.menu")}
            onToggle={() => setShowMobileOptions((current) => !current)}
            openLabel={t("dashboard.openOptions")}
          />
        </div>
      </nav>
      {showMobileOptions && (
        <div className="mx-auto flex max-w-6xl justify-end gap-2 border-t border-border-card px-5 pt-3 sm:hidden">
          <ThemeToggle />
          <LanguageSwitcher />
          <button
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-on-surface"
            onClick={() => void signOut()}
            type="button"
          >
            {t("dashboard.logOut")}
          </button>
        </div>
      )}

      {hasValidTripId ? (
        <section className="mx-auto max-w-7xl px-5 pb-12 pt-6 sm:px-8 sm:pt-10">
          <button
            className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-muted transition hover:bg-surface-muted hover:text-on-surface"
            onClick={goBackToOverview}
            type="button"
          >
            <span aria-hidden="true">←</span>
            {t("dashboard.backToTrips")}
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-medium tracking-[-0.04em] text-brand">
              {isTravelMode
                ? t("travelMode.title")
                : isBackupMode
                  ? t("tripModes.backup")
                  : t("dashboard.plan")}
            </h1>
            {selectedTrip &&
              (selectedTrip.itemDetailVisibility.showPrice ||
                selectedTrip.itemDetailVisibility.showWebsite) && (
                <button
                  aria-pressed={showItemDetails}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-on-surface transition hover:border-brand"
                  onClick={() => setShowItemDetails((current) => !current)}
                  type="button"
                >
                  {showItemDetails ? t("dashboard.hideDetails") : t("dashboard.showDetails")}
                </button>
              )}
          </div>
          {isTravelMode && detailsError && (
            <p className="mt-4 text-sm text-error">{detailsError}</p>
          )}
          <nav
            aria-label={t("tripModes.plan")}
            className={`mt-5 grid grid-cols-3 rounded-xl bg-surface-muted p-1 ${
              isPlanMode ? "" : "lg:sticky lg:top-0 lg:z-20"
            }`}
          >
            <Link
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                isPlanMode ? "bg-surface text-on-surface shadow-sm" : "text-muted"
              }`}
              to={`/trips/${tripId}`}
            >
              {t("tripModes.plan")}
            </Link>
            <Link
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                isBackupMode ? "bg-surface text-on-surface shadow-sm" : "text-muted"
              }`}
              to={`/trips/${tripId}/backup`}
            >
              {t("tripModes.backup")}
            </Link>
            <Link
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                isTravelMode ? "bg-surface text-on-surface shadow-sm" : "text-muted"
              }`}
              to={`/trips/${tripId}/travel`}
            >
              {t("tripModes.travel")}
            </Link>
          </nav>
          {isTravelMode && selectedTrip ? (
            <TravelMode
              accessToken={session.access_token}
              showDetails={showItemDetails}
              trip={selectedTrip}
            />
          ) : isBackupMode && selectedTrip ? (
            <TripBackupPage
              accessToken={session.access_token}
              daySelection={daySelection}
              onTripUpdated={handleTripUpdated}
              showDetails={showItemDetails}
              trip={selectedTrip}
              userId={session.user.id}
            />
          ) : isPlanMode && selectedTrip ? (
            isDesktop ? (
              <TripSpreadsheetPage
                accessToken={session.access_token}
                onTripDeleted={handleDeleteTrip}
                onOpenMap={handleOpenMap}
                onPreferencePendingChange={setIsPreferenceSaving}
                onReorderPendingChange={setIsDesktopReordering}
                onTripUpdated={handleTripUpdated}
                showDetails={showItemDetails}
                trip={selectedTrip}
                userId={session.user.id}
              />
            ) : (
              renderTripDetails()
            )
          ) : (
            renderTripDetails()
          )}
        </section>
      ) : (
        <section className="mx-auto max-w-2xl px-5 pb-12 pt-10 sm:px-8 sm:pt-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-text">
            {t("dashboard.myTrips")}
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-4xl font-medium tracking-[-0.05em] text-brand sm:text-5xl">
                {t("dashboard.heading")}
              </h1>
              <p className="mt-4 max-w-lg leading-7 text-muted">{t("dashboard.intro")}</p>
            </div>
            <button
              className="rounded-xl bg-brand-surface px-5 py-3 font-semibold text-on-brand transition hover:bg-brand-surface-hover"
              onClick={() => setIsCreating((current) => !current)}
              type="button"
            >
              {isCreating ? t("dashboard.closeNewTrip") : t("dashboard.newTrip")}
            </button>
          </div>

          {isCreating && (
            <TripForm
              accessToken={session.access_token}
              onCancel={() => setIsCreating(false)}
              onCreated={handleCreated}
            />
          )}

          {error && (
            <div className="mt-8 rounded-2xl border border-danger-border bg-error-surface p-5 text-sm text-error">
              {error}
            </div>
          )}

          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-brand">{t("dashboard.tripOverview")}</h2>
              <label className="sr-only" htmlFor="trip-search">
                {t("dashboard.searchTrips")}
              </label>
              <input
                className="w-40 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                id="trip-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("dashboard.search")}
                value={search}
              />
            </div>
            {isLoading ? (
              <div className="mt-5 grid gap-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div className="h-24 animate-pulse rounded-2xl bg-surface-inset" key={index} />
                ))}
              </div>
            ) : filteredTrips.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {filteredTrips.map((trip) => (
                  <button
                    className="w-full rounded-2xl border border-border-card bg-surface p-4 text-left transition hover:border-brand hover:bg-surface-soft"
                    key={trip.id}
                    onClick={() => navigate(`/trips/${trip.id}`)}
                    type="button"
                  >
                    <p className="font-semibold text-brand">{trip.name}</p>
                    <p className="mt-2 text-sm text-muted">{formatDateRange(trip)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-dashed border-border-dashed p-6 text-sm text-muted">
                {t("dashboard.noTrips")}
              </p>
            )}
          </section>
        </section>
      )}
    </main>
  )
}
