import { useTranslation } from "react-i18next"
import type { TripPresenceViewer } from "./useTripPresence"

type TripPresenceIndicatorProps = {
  viewers: TripPresenceViewer[]
  tone?: "brand" | "surface"
  className?: string
}

export function TripPresenceIndicator({
  viewers,
  tone = "surface",
  className = "",
}: TripPresenceIndicatorProps) {
  const { t } = useTranslation()

  if (viewers.length === 0) {
    return null
  }

  const visibleViewers = viewers.slice(0, 3)
  const hiddenCount = viewers.length - visibleViewers.length
  const containerClassName =
    tone === "brand"
      ? "border-white/15 bg-white/10 text-on-brand"
      : "border-border bg-surface-soft text-on-surface"
  const badgeClassName =
    tone === "brand" ? "bg-white/15 text-on-brand" : "bg-surface text-on-surface"
  const dotClassName = "bg-success"

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${containerClassName}`}
      >
        <span className={`size-2 rounded-full ${dotClassName}`} />
        {t("tripPresence.active")}
      </span>
      <div className="flex flex-wrap gap-2">
        {visibleViewers.map((viewer) => (
          <span
            className={`max-w-44 truncate rounded-full px-3 py-1 text-xs font-medium ${badgeClassName}`}
            key={viewer.userId}
            title={viewer.label}
          >
            {viewer.label || t("tripPresence.viewerFallback")}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClassName}`}>
            +{hiddenCount}
          </span>
        )}
      </div>
    </div>
  )
}
