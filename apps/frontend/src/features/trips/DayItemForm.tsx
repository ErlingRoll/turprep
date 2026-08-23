import type { FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { TimePicker } from "../../components/TimePicker"
import type { DayItemRecord } from "./planner-types"

type DayItemFormProps = {
  isMealForm: boolean
  editingItemId: string | null
  editingItemType: DayItemRecord["itemType"] | null
  title: string
  googleMapsUrl: string
  googleMapsUrlIsInvalid: boolean
  googleMapsError: string | null
  notes: string
  startTime: string
  endTime: string
  allDay: boolean
  isSaving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  onSelectItemType: (itemType: DayItemRecord["itemType"]) => void
  onTitleChange: (value: string) => void
  onGoogleMapsUrlChange: (value: string) => void
  onNotesChange: (value: string) => void
  onAllDayChange: (value: boolean) => void
  onStartTimeChange: (value: string) => void
  onEndTimeChange: (value: string) => void
}

export function DayItemForm({
  isMealForm,
  editingItemId,
  editingItemType,
  title,
  googleMapsUrl,
  googleMapsUrlIsInvalid,
  googleMapsError,
  notes,
  startTime,
  endTime,
  allDay,
  isSaving,
  onSubmit,
  onCancel,
  onSelectItemType,
  onTitleChange,
  onGoogleMapsUrlChange,
  onNotesChange,
  onAllDayChange,
  onStartTimeChange,
  onEndTimeChange,
}: DayItemFormProps) {
  const { t } = useTranslation()

  return (
    <form
      className="mt-3 grid gap-3 rounded-xl border border-border-soft bg-surface-soft p-3"
      onSubmit={onSubmit}
    >
      {editingItemId === null && (
        <label className="grid gap-1.5 text-sm font-medium text-muted">
          {t("tripDetails.itemType")}
          <select
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
            onChange={(event) =>
              onSelectItemType(event.target.value === "meal" ? "meal" : "activity")
            }
            value={editingItemType ?? "activity"}
          >
            <option value="activity">{t("tripDetails.activity")}</option>
            <option value="meal">{t("tripDetails.meal")}</option>
          </select>
        </label>
      )}
      <label className="grid gap-1.5 text-sm font-medium text-muted">
        {isMealForm ? t("tripDetails.mealName") : t("tripDetails.whatToDo")}
        <input
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={
            isMealForm ? t("tripDetails.mealName") : t("tripDetails.activityPlaceholder")
          }
          required={!googleMapsUrl.trim()}
          value={title}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-muted">
        {t("tripDetails.googleMapsUrl")}
        <input
          aria-invalid={googleMapsUrlIsInvalid}
          className={`rounded-xl border bg-surface px-3 py-2.5 text-ink outline-none ${
            googleMapsUrlIsInvalid
              ? "border-error-strong focus:border-error-strong"
              : "border-border focus:border-brand"
          }`}
          onChange={(event) => onGoogleMapsUrlChange(event.target.value)}
          placeholder={t("tripDetails.googleMapsPlaceholder")}
          type="url"
          value={googleMapsUrl}
        />
        <span className="font-normal">{t("tripDetails.googleMapsHelp")}</span>
        {googleMapsUrlIsInvalid && (
          <span className="font-normal text-error-strong" role="alert">
            {t("errors.googleMapsInvalid")}
          </span>
        )}
        {googleMapsError && (
          <span className="font-normal text-error-strong" role="alert">
            {googleMapsError}
          </span>
        )}
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-muted">
        {t("tripDetails.notes")}
        <textarea
          className="min-h-20 resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder={t("tripDetails.notesPlaceholder")}
          value={notes}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          checked={allDay}
          className="size-4 accent-brand"
          onChange={(event) => onAllDayChange(event.target.checked)}
          type="checkbox"
        />
        {t("tripDetails.allDay")}
      </label>
      {!allDay && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TimePicker label={t("common.from")} onChange={onStartTimeChange} value={startTime} />
          {startTime && (
            <TimePicker
              label={t("common.to")}
              onChange={onEndTimeChange}
              showLabel={false}
              value={endTime}
            />
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
          onClick={onCancel}
          type="button"
        >
          {t("common.cancel")}
        </button>
        <button
          className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving
            ? t(
                editingItemType === "meal"
                  ? "tripDetails.savingMeal"
                  : "tripDetails.savingActivity",
              )
            : isMealForm
              ? editingItemId
                ? t("tripDetails.saveMealChanges")
                : t("tripDetails.saveMeal")
              : editingItemId
                ? t("tripDetails.saveActivityChanges")
                : t("tripDetails.saveActivity")}
        </button>
      </div>
    </form>
  )
}
