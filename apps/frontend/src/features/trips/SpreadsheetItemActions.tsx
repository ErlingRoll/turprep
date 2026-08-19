import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import type { Activity, Meal } from "../../api"
import { MapLocateButton } from "../../components/MapLocateButton"
import { isAllowedGoogleMapsUrl } from "@turprep/models"

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.42Z"
        fill="#4285f4"
      />
      <path
        d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.53A9.75 9.75 0 0 0 12 21.5Z"
        fill="#34a853"
      />
      <path
        d="M6.51 13.57A5.86 5.86 0 0 1 6.2 12c0-.54.09-1.07.3-1.57V7.9H3.27A9.5 9.5 0 0 0 2.25 12c0 1.48.35 2.88 1.02 4.1l3.24-2.53Z"
        fill="#fbbc05"
      />
      <path
        d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.73 5.4l3.24 2.53C7.29 8.11 9.45 6.39 12 6.39Z"
        fill="#ea4335"
      />
    </svg>
  )
}

type SpreadsheetItemActionsProps = {
  isBusy: boolean
  item: Activity | Meal
  onChangeGoogleMapsUrl: (googleMapsUrl: string | null) => Promise<string | null>
  onDelete: () => void
  onMoveToBackup: () => void
  onOpenMap?: () => void
}

export function SpreadsheetItemActions({
  isBusy,
  item,
  onChangeGoogleMapsUrl,
  onDelete,
  onMoveToBackup,
  onOpenMap,
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
          <GoogleIcon />
        </a>
      ) : (
        <button
          aria-label={t("tripDetails.openGoogleMaps")}
          className="grid size-9 cursor-not-allowed place-items-center rounded-xl border border-border bg-surface p-2 text-disabled opacity-50 grayscale"
          disabled
          title={t("tripDetails.openGoogleMaps")}
          type="button"
        >
          <GoogleIcon />
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
                  {t("backup.moveToBackup")}
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
