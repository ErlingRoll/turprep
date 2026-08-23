import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { createTrip, type Trip } from "../../api"
import { DatePicker } from "../../components/DatePicker"
import { getErrorMessage } from "../../lib/errors"
import { getDefaultCurrency } from "../../lib/currency"
import { getTripDurationMessage, shiftDate } from "../../lib/trip-dates"

type TripFormProps = {
  accessToken: string
  onCreated: (trip: Trip) => void
  onCancel: () => void
}

export function TripForm({ accessToken, onCreated, onCancel }: TripFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    startDate: false,
    endDate: false,
  })
  const nameError = touchedFields.name && !name.trim() ? t("tripForm.nameRequired") : null
  const startDateError =
    touchedFields.startDate && !startDate ? t("tripForm.startDateRequired") : null
  const endDateError = touchedFields.endDate
    ? !endDate
      ? t("tripForm.endDateRequired")
      : endDate < startDate
        ? t("errors.tripDatesInvalid")
        : getTripDurationMessage(startDate, endDate)
    : null
  const isFormValid = Boolean(
    name.trim() &&
      startDate &&
      endDate &&
      endDate >= startDate &&
      !getTripDurationMessage(startDate, endDate),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setTouchedFields({
      name: true,
      startDate: true,
      endDate: true,
    })

    if (!name.trim()) {
      setError(t("tripForm.nameRequired"))
      return
    }

    if (!startDate || !endDate) {
      setError(t("tripForm.datesRequired"))
      return
    }

    if (endDate < startDate) {
      setError(t("errors.tripDatesInvalid"))
      return
    }

    const durationError = getTripDurationMessage(startDate, endDate)

    if (durationError) {
      setError(durationError)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const trip = await createTrip(accessToken, {
        name,
        startDate,
        endDate,
        notes,
        acceptedCurrencies: [getDefaultCurrency()],
      })
      onCreated(trip)
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="mt-6 rounded-2xl border border-border-soft bg-surface-soft p-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h3 className="font-semibold text-brand">{t("tripForm.title")}</h3>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-muted">
          {t("tripForm.name")}
          <input
            aria-describedby={nameError ? "trip-name-error" : undefined}
            aria-invalid={Boolean(nameError)}
            className={`rounded-xl border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand ${
              nameError ? "border-error" : "border-border"
            }`}
            onBlur={() => setTouchedFields((current) => ({ ...current, name: true }))}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tripForm.namePlaceholder")}
            required
            value={name}
          />
          {nameError && (
            <p className="text-xs font-normal text-error" id="trip-name-error" role="alert">
              {nameError}
            </p>
          )}
        </label>
        <label className="grid gap-2 text-sm font-medium text-muted">
          {t("tripForm.notes")}
          <textarea
            className="min-h-24 resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("tripForm.notesPlaceholder")}
            value={notes}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            error={startDateError}
            label={t("tripForm.startDate")}
            onChange={(date) => {
              setTouchedFields((current) => ({ ...current, startDate: true }))
              setStartDate(date)
              const maximumEndDate = shiftDate(date, 59)
              if (!endDate || endDate < date) {
                setEndDate(date)
              } else if (endDate > maximumEndDate) {
                setEndDate(maximumEndDate)
              }
            }}
            maxDate={endDate ? shiftDate(endDate, -59) : undefined}
            value={startDate}
          />
          <DatePicker
            error={endDateError}
            label={t("tripForm.endDate")}
            maxDate={startDate ? shiftDate(startDate, 59) : undefined}
            minDate={startDate}
            onChange={(date) => {
              setTouchedFields((current) => ({ ...current, endDate: true }))
              setEndDate(date)
            }}
            value={endDate}
          />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-error">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
          onClick={onCancel}
          type="button"
        >
          {t("tripForm.cancel")}
        </button>
        <button
          className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
          disabled={isSaving || !isFormValid}
          type="submit"
        >
          {isSaving ? t("tripForm.creating") : t("tripForm.create")}
        </button>
      </div>
    </form>
  )
}
