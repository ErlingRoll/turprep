import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { LanguageSwitcher } from "../../components/LanguageSwitcher"
import { ThemeToggle } from "../../components/ThemeToggle"
import { TurprepLogo } from "../../components/TurprepLogo"
import { PRODUCT_NAME } from "../../lib/brand"
import { TripPresenceIndicator } from "./TripPresenceIndicator"
import type { TripPresenceViewer } from "./useTripPresence"

type DesktopTripNavbarProps = {
  email: string | undefined
  isBackupMode: boolean
  isMapMode: boolean
  isPlanMode: boolean
  isTravelMode: boolean
  onSignOut: () => void
  presenceViewers: TripPresenceViewer[]
  tripId: string | undefined
}

export function DesktopTripNavbar({
  email,
  isBackupMode,
  isMapMode,
  isPlanMode,
  isTravelMode,
  onSignOut,
  presenceViewers,
  tripId,
}: DesktopTripNavbarProps) {
  const { t } = useTranslation()
  const tripBasePath = tripId ? `/trips/${tripId}` : null

  return (
    <nav className="sticky top-0 z-40 hidden border-b border-border bg-surface/90 shadow-sm backdrop-blur lg:block">
      <div className="mx-auto max-w-7xl px-8 py-3">
        <div className="flex items-center gap-5">
          <Link className="flex shrink-0 items-center gap-3 font-semibold tracking-tight text-brand" to="/">
            <TurprepLogo />
            <span>{PRODUCT_NAME}</span>
          </Link>

          {tripId && (
            <TripPresenceIndicator
              className="min-w-0 border-l border-border pl-5"
              viewers={presenceViewers}
            />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <span className="hidden max-w-48 truncate text-sm text-muted xl:block">{email}</span>
            <button
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold transition hover:border-brand"
              onClick={onSignOut}
              type="button"
            >
              {t("dashboard.logOut")}
            </button>
          </div>
        </div>

        {tripBasePath && (
          <div className="mt-3 flex items-center gap-4 border-t border-border-divider pt-3">
            <Link
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-muted transition hover:bg-surface-muted hover:text-on-surface"
              to="/"
            >
              <span aria-hidden="true">←</span>
              {t("dashboard.backToTrips")}
            </Link>
            <div
              aria-label={t("tripModes.plan")}
              className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-surface-muted p-1"
              role="navigation"
            >
              <Link
                className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${
                  isPlanMode
                    ? "bg-brand-surface text-on-brand shadow-sm"
                    : "text-muted hover:bg-surface hover:text-on-surface"
                }`}
                to={tripBasePath}
              >
                {t("tripModes.plan")}
              </Link>
              <Link
                className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${
                  isBackupMode
                    ? "bg-brand-surface text-on-brand shadow-sm"
                    : "text-muted hover:bg-surface hover:text-on-surface"
                }`}
                to={`${tripBasePath}/backup`}
              >
                {t("tripModes.backup")}
              </Link>
              <Link
                className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${
                  isMapMode
                    ? "bg-brand-surface text-on-brand shadow-sm"
                    : "text-muted hover:bg-surface hover:text-on-surface"
                }`}
                to={`${tripBasePath}/map`}
              >
                {t("tripModes.map")}
              </Link>
              <Link
                className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition ${
                  isTravelMode
                    ? "bg-brand-surface text-on-brand shadow-sm"
                    : "text-muted hover:bg-surface hover:text-on-surface"
                }`}
                to={`${tripBasePath}/travel`}
              >
                {t("tripModes.travel")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
