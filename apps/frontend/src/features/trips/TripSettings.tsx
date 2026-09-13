import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  updateTrip,
  updateTripCurrencies,
  updateTripItemDetailVisibility,
  type TripDetail,
} from "../../api"
import { DatePicker } from "../../components/DatePicker"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { getErrorMessage } from "../../lib/errors"
import { getTripDurationMessage, shiftDate } from "../../lib/trip-dates"
import { getDefaultCurrency } from "../../lib/currency"
import { TripSharingSettings } from "./TripSharingSettings"

type TripSettingsProps = {
  accessToken: string
  trip: TripDetail
  onSaved: (trip: TripDetail) => void
  onClose: () => void
  onDelete: (trip: TripDetail) => Promise<void>
}

export function TripSettings({ accessToken, trip, onSaved, onClose, onDelete }: TripSettingsProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(trip.name)
  const [notes, setNotes] = useState(trip.notes ?? "")
  const [startDate, setStartDate] = useState(trip.startDate)
  const [endDate, setEndDate] = useState(trip.endDate)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
  const [canManageSharing, setCanManageSharing] = useState(false)
  const [currencies, setCurrencies] = useState<string[]>([])
  const [currencyInput, setCurrencyInput] = useState("")
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [isSavingCurrencies, setIsSavingCurrencies] = useState(false)
  const [showPrice, setShowPrice] = useState(true)
  const [showWebsite, setShowWebsite] = useState(true)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [isSavingVisibility, setIsSavingVisibility] = useState(false)

  useEffect(() => {
    setName(trip.name)
    setNotes(trip.notes ?? "")
    setStartDate(trip.startDate)
    setEndDate(trip.endDate)
    setError(null)
    setCanManageSharing(false)
    setCurrencies(
      trip.acceptedCurrencies.length > 0 ? trip.acceptedCurrencies : [getDefaultCurrency()],
    )
    setCurrencyInput("")
    setCurrencyError(null)
    setShowPrice(trip.itemDetailVisibility.showPrice)
    setShowWebsite(trip.itemDetailVisibility.showWebsite)
    setVisibilityError(null)
  }, [trip])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!startDate || !endDate) {
      setError(t("tripSettings.datesRequired"))
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
      const updatedTrip = await updateTrip(accessToken, trip.id, {
        name,
        startDate,
        endDate,
        notes,
      })
      onSaved(updatedTrip)
      onClose()
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await onDelete(trip)
    } finally {
      setIsDeleting(false)
      setIsDeleteConfirmationOpen(false)
    }
  }

  const usedCurrencies = new Set(
    [...trip.days.flatMap((day) => day.activities), ...trip.meals, ...trip.housingStays]
      .map((item) => item.priceCurrency)
      .filter((currency): currency is string => currency !== null),
  )

  async function saveCurrencies(nextCurrencies: string[]) {
    setIsSavingCurrencies(true)
    setCurrencyError(null)

    try {
      const settings = await updateTripCurrencies(accessToken, trip.id, {
        acceptedCurrencies: nextCurrencies,
      })
      setCurrencies(settings.acceptedCurrencies)
      onSaved({ ...trip, acceptedCurrencies: settings.acceptedCurrencies })
    } catch (reason: unknown) {
      setCurrencyError(getErrorMessage(reason))
    } finally {
      setIsSavingCurrencies(false)
    }
  }

  function handleAddCurrency() {
    const currency = currencyInput.trim().toUpperCase()

    if (!/^[A-Z]{3}$/.test(currency)) {
      setCurrencyError(t("tripSettings.currencyInvalid"))
      return
    }

    if (currencies.includes(currency)) {
      setCurrencyError(t("tripSettings.currencyDuplicate"))
      return
    }

    setCurrencyInput("")
    void saveCurrencies([...currencies, currency])
  }

  function handleRemoveCurrency(currency: string) {
    if (usedCurrencies.has(currency)) {
      setCurrencyError(t("tripSettings.currencyInUse", { currency }))
      return
    }

    void saveCurrencies(currencies.filter((currentCurrency) => currentCurrency !== currency))
  }

  async function handleSaveVisibility() {
    setIsSavingVisibility(true)
    setVisibilityError(null)

    try {
      const settings = await updateTripItemDetailVisibility(accessToken, trip.id, {
        showPrice,
        showWebsite,
      })
      onSaved({ ...trip, itemDetailVisibility: settings })
    } catch (reason: unknown) {
      setVisibilityError(getErrorMessage(reason))
    } finally {
      setIsSavingVisibility(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-brand">{t("tripSettings.title")}</h4>
          <p className="mt-1 text-sm text-muted">{t("tripSettings.description")}</p>
        </div>
        <button
          aria-label={t("tripSettings.close")}
          className="grid size-9 place-items-center rounded-lg text-xl text-muted hover:bg-surface-muted"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="grid gap-2 text-sm font-medium text-muted">
          {t("tripSettings.name")}
          <input
            className="rounded-xl border border-border bg-input px-3 py-2.5 text-input-ink outline-none focus:border-brand"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-muted">
          {t("tripSettings.notes")}
          <textarea
            className="min-h-24 resize-y rounded-xl border border-border bg-input px-3 py-2.5 text-input-ink outline-none focus:border-brand"
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("tripSettings.notesPlaceholder")}
            value={notes}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label={t("tripSettings.startDate")}
            onChange={(date) => {
              setStartDate(date)
              const maximumEndDate = shiftDate(date, 59)
              if (endDate < date) {
                setEndDate(date)
              } else if (endDate > maximumEndDate) {
                setEndDate(maximumEndDate)
              }
            }}
            minDate={endDate ? shiftDate(endDate, -59) : undefined}
            value={startDate}
          />
          <DatePicker
            label={t("tripSettings.endDate")}
            maxDate={shiftDate(startDate, 59)}
            minDate={startDate}
            onChange={setEndDate}
            value={endDate}
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex flex-col-reverse gap-3 border-t border-border-card pt-4 sm:flex-row sm:items-center sm:justify-between">
          {canManageSharing && (
            <button
              className="rounded-xl border border-danger-border px-4 py-2.5 text-sm font-semibold text-error hover:bg-danger-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeleting || isSaving}
              onClick={() => setIsDeleteConfirmationOpen(true)}
              type="button"
            >
              {isDeleting ? t("tripSettings.deleting") : t("tripSettings.delete")}
            </button>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
              onClick={onClose}
              type="button"
            >
              {t("tripSettings.cancel")}
            </button>
            <button
              className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
              disabled={isSaving || isDeleting}
              type="submit"
            >
              {isSaving ? t("tripSettings.saving") : t("tripSettings.save")}
            </button>
          </div>
        </div>
      </form>
      <section className="mt-5 grid gap-3 border-t border-border-card pt-4">
        <div>
          <h5 className="font-semibold text-brand">{t("tripSettings.currenciesTitle")}</h5>
          <p className="mt-1 text-sm text-muted">{t("tripSettings.currenciesDescription")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label={t("tripSettings.currencyInput")}
            className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2.5 text-input-ink outline-none focus:border-brand"
            maxLength={3}
            onChange={(event) => setCurrencyInput(event.target.value)}
            placeholder="EUR"
            value={currencyInput}
          />
          <button
            className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
            disabled={isSavingCurrencies}
            onClick={handleAddCurrency}
            type="button"
          >
            {t("tripSettings.addCurrency")}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {currencies.map((currency) => (
            <div
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm font-semibold text-on-surface"
              key={currency}
            >
              <span>{currency}</span>
              <button
                aria-label={t("tripSettings.removeCurrency", { currency })}
                className="text-muted hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isSavingCurrencies || usedCurrencies.has(currency)}
                onClick={() => handleRemoveCurrency(currency)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {currencyError && <p className="text-sm text-error">{currencyError}</p>}
      </section>
      <section className="mt-5 grid gap-3 border-t border-border-card pt-4">
        <div>
          <h5 className="font-semibold text-brand">{t("tripSettings.visibilityTitle")}</h5>
          <p className="mt-1 text-sm text-muted">{t("tripSettings.visibilityDescription")}</p>
        </div>
        <label className="flex items-center gap-3 text-sm text-on-surface">
          <input
            checked={showPrice}
            onChange={(event) => setShowPrice(event.target.checked)}
            type="checkbox"
          />
          {t("tripSettings.showPrice")}
        </label>
        <label className="flex items-center gap-3 text-sm text-on-surface">
          <input
            checked={showWebsite}
            onChange={(event) => setShowWebsite(event.target.checked)}
            type="checkbox"
          />
          {t("tripSettings.showWebsite")}
        </label>
        {visibilityError && <p className="text-sm text-error">{visibilityError}</p>}
        <div>
          <button
            className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
            disabled={isSavingVisibility}
            onClick={() => void handleSaveVisibility()}
            type="button"
          >
            {isSavingVisibility
              ? t("tripSettings.savingVisibility")
              : t("tripSettings.saveVisibility")}
          </button>
        </div>
      </section>
      <TripSharingSettings
        accessToken={accessToken}
        onCanManageChange={setCanManageSharing}
        trip={trip}
      />
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        isConfirming={isDeleting}
        isOpen={isDeleteConfirmationOpen}
        message={t("tripSettings.deleteConfirmation", { name: trip.name })}
        onCancel={() => setIsDeleteConfirmationOpen(false)}
        onConfirm={() => void handleDelete()}
        title={t("common.confirmDeletionTitle")}
      />
    </section>
  )
}
