import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import type { Activity, Meal } from "../../api"
import { MapLocateButton } from "../../components/MapLocateButton"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import { SpreadsheetGoogleIcon } from "./SpreadsheetGoogleIcon"

type SpreadsheetItemActionsProps = {
  isBusy: boolean
  item: Activity | Meal
  onChangeGoogleMapsUrl: (googleMapsUrl: string | null) => Promise<string | null>
  onDelete: () => void
  onMoveToBackup: () => void
  onOpenMap?: () => void
  moveActionLabel?: string
}

export function SpreadsheetItemActions({
  isBusy,
  item,
  onChangeGoogleMapsUrl,
  onDelete,
  onMoveToBackup,
  onOpenMap,
  moveActionLabel,
}: SpreadsheetItemActionsProps) {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isEditingMaps, setIsEditingMaps] = useState(false)
  const [mapsDraft, setMapsDraft] = useState("")
  const [mapsError, setMapsError] = useState<string | null>(null)
  const hasValidMapsUrl = Boolean(item.googleMapsUrl && isAllowedGoogleMapsUrl(item.googleMapsUrl))

  function startEditingMaps() {
    setMapsDraft(item.googleMapsUrl ?? "")
    setMapsError(null)
    setIsEditingMaps(true)
  }

  async function saveMaps(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedGoogleMapsUrl = mapsDraft.trim()

    if (normalizedGoogleMapsUrl.length > 0 && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)) {
      setMapsError(t("errors.googleMapsInvalid"))
      return
    }

    const error = await onChangeGoogleMapsUrl(normalizedGoogleMapsUrl || null)
    if (error) {
      setMapsError(error)
      return
    }

    setIsEditingMaps(false)
    setIsMenuOpen(false)
  }

  return (
    <div className="flex items-stretch justify-end gap-1">
      {onOpenMap && item.latitude !== null && item.longitude !== null && (
        <MapLocateButton label={t("tripMap.locate")} onClick={onOpenMap} />
      )}
      {hasValidMapsUrl ? (
        <a
          aria-label={t("tripDetails.openGoogleMaps")}
          className="grid size-9 place-items-center rounded-xl border border-border bg-surface p-2 text-muted hover:bg-surface-muted hover:text-brand"
          href={item.googleMapsUrl ?? undefined}
          rel="noreferrer"
          target="_blank"
          title={t("tripDetails.openGoogleMaps")}
        >
          <SpreadsheetGoogleIcon />
        </a>
      ) : (
        <button
          aria-label={t("tripDetails.openGoogleMaps")}
          className="grid size-9 cursor-not-allowed place-items-center rounded-xl border border-border bg-surface p-2 text-disabled opacity-50 grayscale"
          disabled
          title={t("tripDetails.openGoogleMaps")}
          type="button"
        >
          <SpreadsheetGoogleIcon />
        </button>
      )}
      <div className="relative">
        <button
          aria-expanded={isMenuOpen}
          aria-label={t("common.menu")}
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface p-2 text-muted hover:bg-surface-muted hover:text-brand disabled:opacity-50"
          disabled={isBusy}
          onClick={() => setIsMenuOpen((current) => !current)}
          title={t("common.menu")}
          type="button"
        >
          <svg aria-hidden="true" className="size-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
        {isMenuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 grid min-w-52 gap-1 rounded-xl border border-border bg-surface p-1 shadow-popover">
            {!isEditingMaps ? (
              <>
                <button
                  className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-on-surface hover:bg-surface-muted"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onMoveToBackup()
                  }}
                  type="button"
                >
                  {moveActionLabel ?? t("backup.moveToBackup")}
                </button>
                <button
                  className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-on-surface hover:bg-surface-muted"
                  onClick={startEditingMaps}
                  type="button"
                >
                  {t("spreadsheet.changeGoogleMaps")}
                </button>
                <button
                  className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-error hover:bg-danger-surface"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onDelete()
                  }}
                  type="button"
                >
                  {t("common.delete")}
                </button>
              </>
            ) : (
              <form className="grid gap-2 p-2" onSubmit={(event) => void saveMaps(event)}>
                <label className="grid gap-1 text-xs font-semibold text-muted">
                  {t("spreadsheet.changeGoogleMaps")}
                  <input
                    autoFocus
                    className="w-64 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-on-surface outline-none focus:border-brand"
                    onChange={(event) => {
                      setMapsDraft(event.target.value)
                      setMapsError(null)
                    }}
                    placeholder={t("tripDetails.googleMapsPlaceholder")}
                    type="url"
                    value={mapsDraft}
                  />
                </label>
                {mapsError && <p className="text-xs text-error">{mapsError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
                    onClick={() => setIsEditingMaps(false)}
                    type="button"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
                    disabled={isBusy}
                    type="submit"
                  >
                    {isBusy ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
