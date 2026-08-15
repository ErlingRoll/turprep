import { useRef, type ReactNode, type TouchEvent } from "react"
import { useTranslation } from "react-i18next"
import type { TripDetail } from "../../api"
import { formatDate } from "../../lib/date-format"

type MobileDayPagerProps = {
  days: TripDetail["days"]
  selectedDate: string
  onSelectDate: (date: string) => void
  children: ReactNode
}

type MobileDayControlsProps = Omit<MobileDayPagerProps, "children"> & {
  className?: string
}

export function DayChevron({ direction }: { direction: "next" | "previous" }) {
  return (
    <svg
      aria-hidden="true"
      className="size-7"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d={direction === "next" ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  )
}

export function MobileDayControls({
  days,
  selectedDate,
  onSelectDate,
  className = "",
}: MobileDayControlsProps) {
  const { t } = useTranslation()
  const selectedIndex = Math.max(
    0,
    days.findIndex((day) => day.date === selectedDate),
  )
  const selectedDay = days[selectedIndex]

  if (!selectedDay) {
    return null
  }

  function moveDay(offset: number) {
    const nextDay = days[selectedIndex + offset]

    if (nextDay) {
      onSelectDate(nextDay.date)
    }
  }

  return (
    <nav
      aria-label={t("tripDetails.dayNavigator")}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border-card bg-surface/95 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-card backdrop-blur lg:hidden ${className}`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <button
          aria-label={t("travelMode.previousDay")}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-2xl text-on-surface transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
          disabled={selectedIndex === 0}
          onClick={() => moveDay(-1)}
          type="button"
        >
          <DayChevron direction="previous" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-brand">
            {formatDate(selectedDay.date)}
          </p>
          {selectedDay.title?.trim() && (
            <p className="truncate text-xs text-muted">{selectedDay.title}</p>
          )}
        </div>
        <button
          aria-label={t("travelMode.nextDay")}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-2xl text-on-surface transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
          disabled={selectedIndex === days.length - 1}
          onClick={() => moveDay(1)}
          type="button"
        >
          <DayChevron direction="next" />
        </button>
      </div>
    </nav>
  )
}

export function MobileDayPager({
  days,
  selectedDate,
  onSelectDate,
  children,
}: MobileDayPagerProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const selectedIndex = Math.max(
    0,
    days.findIndex((day) => day.date === selectedDate),
  )
  const selectedDay = days[selectedIndex]

  function moveDay(offset: number) {
    const nextDay = days[selectedIndex + offset]

    if (nextDay) {
      onSelectDate(nextDay.date)
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 1) {
      touchStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      }
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const touchStart = touchStartRef.current
    touchStartRef.current = null

    if (!touchStart || event.changedTouches.length === 0) {
      return
    }

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStart.x
    const deltaY = touch.clientY - touchStart.y

    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return
    }

    moveDay(deltaX < 0 ? 1 : -1)
  }

  if (!selectedDay) {
    return <>{children}</>
  }

  return (
    <>
      <div onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
        {children}
      </div>
      <MobileDayControls
        className="z-[60]"
        days={days}
        onSelectDate={onSelectDate}
        selectedDate={selectedDate}
      />
    </>
  )
}
