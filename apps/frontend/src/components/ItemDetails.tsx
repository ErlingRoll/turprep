import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { getErrorMessage } from "../lib/errors"

export type ItemDetailValues = {
  priceAmount: number | null
  priceCurrency: string | null
  website: string | null
}

type ItemDetailsDisplayProps = {
  details: ItemDetailValues
  showPrice: boolean
  showWebsite: boolean
  locale?: string
}

type ItemDetailsEditorProps = {
  currencies: string[]
  details: ItemDetailValues
  onSave: (details: ItemDetailValues) => Promise<void>
}

function formatPrice(amount: number, currency: string, locale?: string) {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amount)
}

export function ItemDetailsDisplay({
  details,
  showPrice,
  showWebsite,
  locale = undefined,
}: ItemDetailsDisplayProps) {
  const { t } = useTranslation()
  const hasPrice = showPrice && details.priceAmount !== null && details.priceCurrency !== null
  const hasWebsite = showWebsite && Boolean(details.website?.trim())

  if (!hasPrice && !hasWebsite) {
    return null
  }

  return (
    <div className="mt-2 grid min-w-0 gap-1 text-sm text-muted">
      {hasPrice && (
        <p>
          <span className="font-semibold text-on-surface">{t("itemDetails.price")}:</span>{" "}
          {formatPrice(details.priceAmount!, details.priceCurrency!, locale)}
        </p>
      )}
      {hasWebsite && (
        <p className="min-w-0 max-w-full overflow-hidden break-all">
          <span className="font-semibold text-on-surface">{t("itemDetails.website")}:</span>{" "}
          {details.website}
        </p>
      )}
    </div>
  )
}

export function ItemDetailsEditor({ currencies, details, onSave }: ItemDetailsEditorProps) {
  const { t } = useTranslation()
  const [priceAmount, setPriceAmount] = useState(
    details.priceAmount === null ? "" : String(details.priceAmount),
  )
  const [priceCurrency, setPriceCurrency] = useState(details.priceCurrency ?? "")
  const [website, setWebsite] = useState(details.website ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setPriceAmount(details.priceAmount === null ? "" : String(details.priceAmount))
    setPriceCurrency(details.priceCurrency ?? "")
    setWebsite(details.website ?? "")
    setError(null)
  }, [details.priceAmount, details.priceCurrency, details.website])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedAmount = priceAmount.trim()
    const normalizedWebsite = website.trim()

    if (!normalizedAmount) {
      if (priceCurrency) {
        setError(t("itemDetails.priceAmountRequired"))
        return
      }
    } else {
      const parsedAmount = Number(normalizedAmount)
      const decimalPlaces = normalizedAmount.split(".")[1]?.length ?? 0

      if (
        !Number.isFinite(parsedAmount) ||
        parsedAmount < 0 ||
        decimalPlaces > 2 ||
        !/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)
      ) {
        setError(t("itemDetails.priceInvalid"))
        return
      }

      if (!priceCurrency) {
        setError(t("itemDetails.priceCurrencyRequired"))
        return
      }
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSave({
        priceAmount: normalizedAmount ? Number(normalizedAmount) : null,
        priceCurrency: normalizedAmount ? priceCurrency : null,
        website: normalizedWebsite || null,
      })
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="mt-3 grid gap-2 border-t border-border-divider pt-2" onSubmit={handleSubmit}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {t("itemDetails.title")}
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="grid gap-1 text-xs font-medium text-muted">
          {t("itemDetails.price")}
          <input
            className="rounded-lg border border-border bg-input px-2.5 py-2 text-sm text-input-ink outline-none focus:border-brand"
            inputMode="decimal"
            min="0"
            onChange={(event) => setPriceAmount(event.target.value)}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={priceAmount}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted">
          {t("itemDetails.currency")}
          <select
            className="rounded-lg border border-border bg-input px-2.5 py-2 text-sm text-input-ink outline-none focus:border-brand"
            onChange={(event) => setPriceCurrency(event.target.value)}
            value={priceCurrency}
          >
            <option value="">{t("itemDetails.noCurrency")}</option>
            {priceCurrency && !currencies.includes(priceCurrency) && (
              <option value={priceCurrency}>{priceCurrency}</option>
            )}
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-muted">
        {t("itemDetails.website")}
        <input
          className="rounded-lg border border-border bg-input px-2.5 py-2 text-sm text-input-ink outline-none focus:border-brand"
          maxLength={2000}
          onChange={(event) => setWebsite(event.target.value)}
          placeholder={t("itemDetails.websitePlaceholder")}
          type="text"
          value={website}
        />
      </label>
      {error && (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          className="rounded-lg bg-brand-surface px-3 py-2 text-xs font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
          disabled={isSaving || currencies.length === 0}
          type="submit"
        >
          {isSaving ? t("itemDetails.saving") : t("itemDetails.save")}
        </button>
      </div>
    </form>
  )
}
