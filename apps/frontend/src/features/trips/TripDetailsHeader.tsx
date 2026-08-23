import { useTranslation } from "react-i18next"
import { formatDateRange } from "../../lib/date-format"
import type { TripDetail } from "../../api"
import { SettingsIcon } from "../../components/SettingsIcon"
import { TripPresenceIndicator } from "./TripPresenceIndicator"
import type { TripPresenceViewer } from "./useTripPresence"

type TripDetailsHeaderProps = {
  trip: TripDetail
  presenceViewers: TripPresenceViewer[]
  showSettings: boolean
  onToggleSettings: () => void
}

export function TripDetailsHeader({
  trip,
  presenceViewers,
  showSettings,
  onToggleSettings,
}: TripDetailsHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl bg-brand-surface p-5 text-on-brand">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-soft">{formatDateRange(trip)}</p>
          <h3 className="mt-2 text-2xl font-medium">{trip.name}</h3>
          <TripPresenceIndicator className="mt-3" tone="brand" viewers={presenceViewers} />
        </div>
        <button
          aria-expanded={showSettings}
          aria-label={t("tripDetails.settings")}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-xl text-on-brand hover:bg-brand-soft"
          onClick={onToggleSettings}
          type="button"
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  )
}
