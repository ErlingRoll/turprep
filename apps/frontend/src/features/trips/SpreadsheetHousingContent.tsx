import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import type { HousingStay } from "../../api"
import { DatePicker } from "../../components/DatePicker"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { formatDate } from "../../lib/date-format"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import type { HousingDraft, HousingEditableField } from "./spreadsheet-types"

function formatHousingPrice(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amount)
}

type SpreadsheetHousingContentProps = {
  housing: HousingStay | undefined
  activeHousingField: HousingEditableField | null
  housingDraft: HousingDraft | null
  housingCreateDraft: HousingDraft | null
  creatingForDay: boolean
  isSaving: boolean
  saveError: string | null
  showPrice: boolean
  showWebsite: boolean
  currencies: string[]
  locale: string
  onDeleteHousing: () => void
  onStartEditing: (field: HousingEditableField) => void
  onUpdateDraft: Dispatch<SetStateAction<HousingDraft | null>>
  onSaveField: (field: HousingEditableField) => void
  onCancelEditing: () => void
  onUpdateCreateDraft: Dispatch<SetStateAction<HousingDraft | null>>
  onSaveCreate: () => void
  onCancelCreate: () => void
  onStartCreating: () => void
}

export function SpreadsheetHousingContent({
  housing,
  activeHousingField,
  housingDraft,
  housingCreateDraft,
  creatingForDay,
  isSaving,
  saveError,
  showPrice,
  showWebsite,
  currencies,
  locale,
  onDeleteHousing,
  onStartEditing,
  onUpdateDraft,
  onSaveField,
  onCancelEditing,
  onUpdateCreateDraft,
  onSaveCreate,
  onCancelCreate,
  onStartCreating,
}: SpreadsheetHousingContentProps) {
  const { t } = useTranslation()

  function renderFieldActions(field: HousingEditableField) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
          disabled={isSaving}
          onClick={() => onSaveField(field)}
          type="button"
        >
          {isSaving ? t("common.saving") : t("common.save")}
        </button>
        <button
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
          disabled={isSaving}
          onClick={onCancelEditing}
          type="button"
        >
          {t("common.cancel")}
        </button>
        {saveError && <p className="basis-full text-xs text-error">{saveError}</p>}
      </div>
    )
  }

  if (housing) {
    return (
      <div className="relative space-y-2">
        <button
          aria-label={t("common.delete")}
          className="absolute right-0 top-0 rounded-lg border border-border p-1.5 text-error hover:bg-danger-surface"
          onClick={onDeleteHousing}
          title={t("common.delete")}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 7h16m-10 4v6m4-6v6M9 7V5h6v2m-9 0 1 12h10l1-12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
        {activeHousingField === "name" && housingDraft ? (
          <>
            <input
              aria-label={t("tripDetails.housingName")}
              autoFocus
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 pr-10 text-sm text-on-surface outline-none focus:border-brand"
              onChange={(event) =>
                onUpdateDraft((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              value={housingDraft.name}
            />
            {renderFieldActions("name")}
          </>
        ) : (
          <button
            className="w-full min-w-0 cursor-text break-words pr-10 text-left font-semibold leading-tight text-brand transition hover:text-brand"
            onClick={() => onStartEditing("name")}
            type="button"
          >
            {housing.name}
          </button>
        )}
        {activeHousingField === "checkIn" && housingDraft ? (
          <>
            <DatePicker
              label={t("tripDetails.checkIn")}
              onChange={(value) =>
                onUpdateDraft((current) => (current ? { ...current, checkIn: value } : current))
              }
              value={housingDraft.checkIn}
            />
            {renderFieldActions("checkIn")}
          </>
        ) : (
          <button
            className="w-full cursor-text text-left text-xs text-muted transition hover:text-brand"
            onClick={() => onStartEditing("checkIn")}
            type="button"
          >
            {housing.checkIn ? formatDate(housing.checkIn) : t("tripDetails.checkIn")}
          </button>
        )}
        {activeHousingField === "checkOut" && housingDraft ? (
          <>
            <DatePicker
              label={t("tripDetails.checkOut")}
              onChange={(value) =>
                onUpdateDraft((current) => (current ? { ...current, checkOut: value } : current))
              }
              value={housingDraft.checkOut}
            />
            {renderFieldActions("checkOut")}
          </>
        ) : (
          <button
            className="w-full cursor-text text-left text-xs text-muted transition hover:text-brand"
            onClick={() => onStartEditing("checkOut")}
            type="button"
          >
            {housing.checkOut ? formatDate(housing.checkOut) : t("tripDetails.checkOut")}
          </button>
        )}
        {housing.googleMapsUrl && isAllowedGoogleMapsUrl(housing.googleMapsUrl) && (
          <div className="grid justify-items-start">
            <GoogleMapsLinkButton
              href={housing.googleMapsUrl}
              label={t("tripDetails.openGoogleMaps")}
            />
          </div>
        )}
        {activeHousingField === "notes" && housingDraft ? (
          <>
            <textarea
              aria-label={t("tripDetails.notes")}
              autoFocus
              className="min-h-20 resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
              onChange={(event) =>
                onUpdateDraft((current) =>
                  current ? { ...current, notes: event.target.value } : current,
                )
              }
              value={housingDraft.notes}
            />
            {renderFieldActions("notes")}
          </>
        ) : (
          <button
            className="inline-block max-w-full min-h-5 w-full cursor-text whitespace-pre-wrap break-words text-left text-sm text-muted transition hover:text-brand"
            onClick={() => onStartEditing("notes")}
            type="button"
          >
            {housing.notes?.trim() || t("spreadsheet.addNote")}
          </button>
        )}
        {showPrice && (
          <div className="mt-2 grid gap-1 text-sm text-muted">
            {activeHousingField === "price" && housingDraft ? (
              <>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                  <label className="grid gap-1 text-xs font-medium">
                    {t("itemDetails.price")}
                    <input
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) =>
                        onUpdateDraft((current) =>
                          current
                            ? {
                                ...current,
                                priceAmount: event.target.value,
                              }
                            : current,
                        )
                      }
                      step="0.01"
                      type="number"
                      value={housingDraft.priceAmount}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    {t("itemDetails.currency")}
                    <select
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                      onChange={(event) =>
                        onUpdateDraft((current) =>
                          current
                            ? {
                                ...current,
                                priceCurrency: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={housingDraft.priceCurrency}
                    >
                      <option value="">{t("itemDetails.noCurrency")}</option>
                      {housingDraft.priceCurrency &&
                        !currencies.includes(housingDraft.priceCurrency) && (
                          <option value={housingDraft.priceCurrency}>
                            {housingDraft.priceCurrency}
                          </option>
                        )}
                      {currencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {renderFieldActions("price")}
              </>
            ) : (
              <button
                className="w-full cursor-text text-left transition hover:text-brand"
                onClick={() => onStartEditing("price")}
                type="button"
              >
                <span className="font-semibold text-on-surface">{t("itemDetails.price")}:</span>{" "}
                {housing.priceAmount !== null && housing.priceCurrency
                  ? formatHousingPrice(housing.priceAmount, housing.priceCurrency, locale)
                  : t("itemDetails.notSet")}
              </button>
            )}
          </div>
        )}
        {showWebsite && (
          <div className="mt-1 text-sm text-muted">
            {activeHousingField === "website" && housingDraft ? (
              <>
                <label className="grid gap-1 text-xs font-medium">
                  {t("itemDetails.website")}
                  <input
                    autoFocus
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                    maxLength={2000}
                    onChange={(event) =>
                      onUpdateDraft((current) =>
                        current ? { ...current, website: event.target.value } : current,
                      )
                    }
                    placeholder={t("itemDetails.websitePlaceholder")}
                    type="text"
                    value={housingDraft.website}
                  />
                </label>
                {renderFieldActions("website")}
              </>
            ) : (
              <button
                className="w-full cursor-text break-all text-left transition hover:text-brand"
                onClick={() => onStartEditing("website")}
                type="button"
              >
                <span className="font-semibold text-on-surface">{t("itemDetails.website")}:</span>{" "}
                {housing.website?.trim() || t("itemDetails.notSet")}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (creatingForDay && housingCreateDraft) {
    return (
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSaveCreate()
        }}
      >
        <input
          aria-label={t("tripDetails.housingName")}
          autoFocus
          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
          onChange={(event) =>
            onUpdateCreateDraft((current) =>
              current ? { ...current, name: event.target.value } : current,
            )
          }
          placeholder={t("tripDetails.housingName")}
          value={housingCreateDraft.name}
        />
        <input
          aria-label={t("tripDetails.googleMapsUrl")}
          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
          onChange={(event) =>
            onUpdateCreateDraft((current) =>
              current ? { ...current, googleMapsUrl: event.target.value } : current,
            )
          }
          placeholder={t("tripDetails.googleMapsPlaceholder")}
          type="url"
          value={housingCreateDraft.googleMapsUrl}
        />
        <DatePicker
          label={t("tripDetails.checkIn")}
          onChange={(value) =>
            onUpdateCreateDraft((current) => (current ? { ...current, checkIn: value } : current))
          }
          value={housingCreateDraft.checkIn}
        />
        <DatePicker
          label={t("tripDetails.checkOut")}
          onChange={(value) =>
            onUpdateCreateDraft((current) => (current ? { ...current, checkOut: value } : current))
          }
          value={housingCreateDraft.checkOut}
        />
        <textarea
          aria-label={t("tripDetails.notes")}
          className="min-h-16 resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
          onChange={(event) =>
            onUpdateCreateDraft((current) =>
              current ? { ...current, notes: event.target.value } : current,
            )
          }
          placeholder={t("tripDetails.notesPlaceholder")}
          value={housingCreateDraft.notes}
        />
        {showPrice && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
            <input
              aria-label={t("itemDetails.price")}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                onUpdateCreateDraft((current) =>
                  current ? { ...current, priceAmount: event.target.value } : current,
                )
              }
              placeholder={t("itemDetails.price")}
              step="0.01"
              type="number"
              value={housingCreateDraft.priceAmount}
            />
            <select
              aria-label={t("itemDetails.currency")}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
              onChange={(event) =>
                onUpdateCreateDraft((current) =>
                  current ? { ...current, priceCurrency: event.target.value } : current,
                )
              }
              value={housingCreateDraft.priceCurrency}
            >
              <option value="">{t("itemDetails.noCurrency")}</option>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        )}
        {showWebsite && (
          <input
            aria-label={t("itemDetails.website")}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
            maxLength={2000}
            onChange={(event) =>
              onUpdateCreateDraft((current) =>
                current ? { ...current, website: event.target.value } : current,
              )
            }
            placeholder={t("itemDetails.websitePlaceholder")}
            type="text"
            value={housingCreateDraft.website}
          />
        )}
        {saveError && <p className="text-xs text-error">{saveError}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? t("common.saving") : t("common.save")}
          </button>
          <button
            className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
            disabled={isSaving}
            onClick={onCancelCreate}
            type="button"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm text-muted">{t("spreadsheet.noHousing")}</span>
      <button
        className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-on-surface disabled:opacity-50"
        disabled={isSaving}
        onClick={onStartCreating}
        type="button"
      >
        {t("tripDetails.add")}
      </button>
    </div>
  )
}
