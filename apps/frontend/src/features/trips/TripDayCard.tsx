import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { formatDate } from "../../lib/date-format"
import type { TripDetail } from "../../api"

type TripDayCardProps = {
  day: TripDetail["days"][number]
  isSelected: boolean
  openDay: string | null
  editingItemId: string | null
  editingDayDate: string | null
  dayTitle: string
  dayNotes: string
  isSavingDayDetails: boolean
  scheduleSummary: string
  onToggleActivityForm: (date: string) => void
  onEditDayDetails: (date: string, title: string | null, notes: string | null) => void
  onDayTitleChange: (value: string) => void
  onDayNotesChange: (value: string) => void
  onCancelDayDetails: () => void
  onSaveDayDetails: (date: string) => void
  renderItemForm: (date: string) => ReactNode
  children: ReactNode
  showDividerOnMobile: boolean
  showDividerOnDesktop: boolean
}

export function TripDayCard({
  day,
  isSelected,
  openDay,
  editingItemId,
  editingDayDate,
  dayTitle,
  dayNotes,
  isSavingDayDetails,
  scheduleSummary,
  onToggleActivityForm,
  onEditDayDetails,
  onDayTitleChange,
  onDayNotesChange,
  onCancelDayDetails,
  onSaveDayDetails,
  renderItemForm,
  children,
  showDividerOnMobile,
  showDividerOnDesktop,
}: TripDayCardProps) {
  const { t } = useTranslation()

  return (
    <div
      className={`rounded-2xl bg-page p-4 ${
        showDividerOnMobile ? "border-t border-border-divider" : ""
      } ${showDividerOnDesktop ? "lg:border-t lg:border-border-divider" : "lg:border-t-0"} ${
        isSelected ? "" : "lg:hidden"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-brand">{formatDate(day.date)}</p>
          <p className="text-lg font-bold text-on-surface">
            {day.title?.trim() && <span className="font-normal">{day.title}</span>}
          </p>
          {/* <p className="mt-1 text-sm text-muted">{scheduleSummary}</p> */}
          {day.notes?.trim() && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{day.notes}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <button
            className="rounded-lg px-2 py-1 text-sm font-semibold text-on-surface hover:bg-surface-muted"
            disabled={editingItemId !== null}
            onClick={() => {
              if (editingItemId !== null) {
                return
              }

              onToggleActivityForm(day.date)
            }}
            type="button"
          >
            {openDay === day.date && editingItemId === null
              ? t("common.close")
              : t("tripDetails.add")}
          </button>
          <button
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
            onClick={() => onEditDayDetails(day.date, day.title, day.notes)}
            type="button"
          >
            {day.title?.trim() || day.notes?.trim()
              ? t("tripDetails.editDayDetails")
              : t("tripDetails.addDayDetails")}
          </button>
        </div>
      </div>

      {openDay === day.date && editingItemId === null && renderItemForm(day.date)}

      {editingDayDate === day.date && (
        <div className="mt-4 grid gap-3 border-t border-border-divider pt-4">
          <label className="grid gap-1.5 text-sm font-medium text-muted">
            {t("tripDetails.dayTitle")}
            <input
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
              maxLength={200}
              onChange={(event) => onDayTitleChange(event.target.value)}
              placeholder={t("tripDetails.dayTitlePlaceholder")}
              type="text"
              value={dayTitle}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-muted">
            {t("tripDetails.dayNote")}
            <textarea
              className="min-h-20 resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
              onChange={(event) => onDayNotesChange(event.target.value)}
              placeholder={t("tripDetails.notesPlaceholder")}
              value={dayNotes}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-muted"
              onClick={onCancelDayDetails}
              type="button"
            >
              {t("common.cancel")}
            </button>
            <button
              className="rounded-xl bg-brand-surface px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
              disabled={isSavingDayDetails}
              onClick={() => onSaveDayDetails(day.date)}
              type="button"
            >
              {isSavingDayDetails ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
