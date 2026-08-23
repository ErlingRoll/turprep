import { useTranslation } from "react-i18next"
import { useState } from "react"
import type { TripPresenceViewer } from "./useTripPresence"

type TripPresenceIndicatorProps = {
  viewers: TripPresenceViewer[]
  tone?: "brand" | "surface"
  className?: string
}

function getViewerInitials(label: string) {
  const initials = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return initials || "?"
}

function ViewerAvatar({
  avatarClassName,
  viewer,
}: {
  avatarClassName: string
  viewer: TripPresenceViewer
}) {
  const [hasImageError, setHasImageError] = useState(false)

  return (
    <span
      aria-label={viewer.label}
      className={`relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[0.65rem] font-bold outline-none ${avatarClassName}`}
      role="img"
      tabIndex={0}
      title={viewer.label}
    >
      {getViewerInitials(viewer.label)}
      {viewer.avatarUrl && !hasImageError && (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setHasImageError(true)}
          src={viewer.avatarUrl}
        />
      )}
    </span>
  )
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

  const avatarClassName =
    tone === "brand"
      ? "bg-white/15 text-on-brand ring-2 ring-brand-surface"
      : "bg-surface-muted text-brand ring-2 ring-surface"

  return (
    <div
      aria-label={t("tripPresence.label")}
      className={`flex items-center gap-1 ${className}`}
      role="group"
    >
      {viewers.map((viewer) => (
        <span className="group relative" key={viewer.userId}>
          <ViewerAvatar avatarClassName={avatarClassName} viewer={viewer} />
          <span
            className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-surface px-2.5 py-1.5 text-xs font-medium text-on-brand opacity-0 shadow-popover transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            role="tooltip"
          >
            {viewer.label}
          </span>
        </span>
      ))}
    </div>
  )
}
