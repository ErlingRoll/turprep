import { useTranslation } from "react-i18next"
import { formatDate } from "../../lib/date-format"
import type { TripDetail } from "../../api"

type TripDayNavigatorProps = {
  days: TripDetail["days"]
  housingStays: TripDetail["housingStays"]
  selectedDay: TripDetail["days"][number]
  selectedDayDates: string[]
  onSelectAll: () => void
  onSelectDay: (date: string, shiftKey: boolean) => void
  onToggleDay: (date: string, shiftKey: boolean) => void
  includeBackupHousing?: boolean
}

export function TripDayNavigator({
  days,
  housingStays,
  selectedDay,
  selectedDayDates,
  onSelectAll,
  onSelectDay,
  onToggleDay,
  includeBackupHousing = false,
}: TripDayNavigatorProps) {
  const { t } = useTranslation()

  return (
    <aside className="hidden self-start lg:block">
      <div className="rounded-2xl border border-border-card bg-page p-3">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <h4 className="text-sm font-semibold text-brand">{t("tripDetails.dayNavigator")}</h4>
          <button
            className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
            onClick={onSelectAll}
            type="button"
          >
            {t("tripDetails.selectAllDays")}
          </button>
        </div>
        <div className="mt-1 grid gap-1">
          {days.map((day) => {
            const isActive = day.date === selectedDay.date
            const isChecked = selectedDayDates.includes(day.date)
            const hasHousing = housingStays.some(
              (stay) =>
                (includeBackupHousing || !stay.isBackup) &&
                stay.checkIn !== null &&
                stay.checkOut !== null &&
                stay.checkIn <= day.date &&
                day.date < stay.checkOut,
            )

            return (
              <div
                className={`flex items-center gap-2 rounded-xl px-2 py-2 transition ${
                  isActive
                    ? "bg-brand-surface text-on-brand"
                    : isChecked
                      ? "bg-surface-muted text-on-surface hover:bg-surface-muted-hover"
                      : "text-muted hover:bg-surface-muted hover:text-on-surface"
                }`}
                key={day.date}
              >
                <input
                  aria-label={t("tripDetails.selectDayForViewing", {
                    date: formatDate(day.date),
                  })}
                  checked={isChecked}
                  className="size-4 shrink-0 accent-gold"
                  onChange={(event) =>
                    onToggleDay(
                      day.date,
                      event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey,
                    )
                  }
                  type="checkbox"
                />
                <button
                  aria-label={
                    hasHousing
                      ? t("tripDetails.selectDayWithHousing", {
                          date: formatDate(day.date),
                        })
                      : t("tripDetails.selectDay", {
                          date: formatDate(day.date),
                        })
                  }
                  className="flex min-w-0 flex-1 overflow-hidden text-left"
                  onClick={(event) => onSelectDay(day.date, event.shiftKey)}
                  type="button"
                >
                  <span className="w-0 min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      <span>{formatDate(day.date)}</span>
                      {hasHousing && (
                        <svg
                          aria-hidden="true"
                          className={`ml-1 inline-block size-3.5 align-[-0.1em] ${
                            isActive ? "text-soft" : "text-accent-text"
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      )}
                    </span>
                    {day.title?.trim() && (
                      <span
                        className={`mt-0.5 block truncate font-bold ${
                          isActive ? "text-on-brand" : "text-on-surface"
                        }`}
                        title={day.title}
                      >
                        {day.title}
                      </span>
                    )}
                    {/* <span
                      className={`mt-0.5 block truncate text-xs ${
                        isActive ? "text-soft" : "text-faint"
                      }`}
                    >
                      {getDayScheduleSummary(day)}
                    </span> */}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
