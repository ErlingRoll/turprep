import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import { getGooglePlacePhoto, type GooglePlaceSuggestion } from "../../api"

type SuggestionMediaGalleryProps = {
  accessToken: string
  suggestion: GooglePlaceSuggestion
}

export function SuggestionMediaGallery({ accessToken, suggestion }: SuggestionMediaGalleryProps) {
  const { t } = useTranslation()
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(suggestion.photoNames.length > 0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadPhotos() {
      const results = await Promise.allSettled(
        suggestion.photoNames.slice(0, 4).map(async (photoName) => {
          const blob = await getGooglePlacePhoto(accessToken, photoName)
          const objectUrl = URL.createObjectURL(blob)
          return objectUrl
        }),
      )
      const loadedPhotoUrls = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      )

      if (!isCancelled) {
        setPhotoUrls(loadedPhotoUrls)
        setIsLoading(false)
      } else {
        loadedPhotoUrls.forEach((photoUrl) => URL.revokeObjectURL(photoUrl))
      }
    }

    setPhotoUrls([])
    setSelectedIndex(null)
    setIsLoading(suggestion.photoNames.length > 0)
    if (suggestion.photoNames.length > 0) {
      void loadPhotos()
    }

    return () => {
      isCancelled = true
    }
  }, [accessToken, suggestion])

  useEffect(() => {
    if (selectedIndex === null) {
      return
    }

    const currentIndex = selectedIndex
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIndex(null)
      } else if (event.key === "ArrowLeft" && currentIndex > 0) {
        setSelectedIndex(currentIndex - 1)
      } else if (event.key === "ArrowRight" && currentIndex < photoUrls.length - 1) {
        setSelectedIndex(currentIndex + 1)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [photoUrls.length, selectedIndex])

  if (suggestion.photoNames.length === 0) {
    return null
  }

  const selectedPhoto = selectedIndex === null ? null : photoUrls[selectedIndex]

  return (
    <>
      <div className="mb-3 grid min-h-24 grid-cols-2 gap-1 overflow-hidden rounded-lg">
        {isLoading && <div className="col-span-2 min-h-24 animate-pulse bg-surface-muted" />}
        {!isLoading && photoUrls.length === 0 && (
          <div className="col-span-2 grid min-h-24 place-items-center bg-surface-muted text-xs text-muted">
            {t("suggestionHelper.photosUnavailable")}
          </div>
        )}
        {photoUrls.map((photoUrl, index) => (
          <button
            aria-label={t("suggestionHelper.openPhotoGallery", { name: suggestion.name })}
            className="block overflow-hidden"
            key={photoUrl}
            onClick={() => setSelectedIndex(index)}
            type="button"
          >
            <img
              alt={`${suggestion.name} ${index + 1}`}
              className="h-24 w-full object-cover transition-transform hover:scale-105"
              loading="lazy"
              src={photoUrl}
            />
          </button>
        ))}
      </div>
      {photoUrls.length > 0 && (
        <p className="mb-3 text-xs text-muted">
          {t("suggestionHelper.photoCount", { count: photoUrls.length })}
        </p>
      )}
      {selectedPhoto &&
        selectedIndex !== null &&
        createPortal(
          <div
            aria-label={t("suggestionHelper.photoGallery")}
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setSelectedIndex(null)}
            role="dialog"
          >
            <div className="flex max-h-full w-fit max-w-full flex-col items-center gap-3">
              <div
                className="relative max-h-[78vh] max-w-full"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  alt={`${suggestion.name} ${selectedIndex + 1}`}
                  className="block max-h-[78vh] max-w-full rounded-xl object-contain"
                  src={selectedPhoto}
                />
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 rounded-t-xl bg-gradient-to-b from-black/70 to-transparent p-3 text-white">
                  <p className="truncate text-sm font-semibold">{suggestion.name}</p>
                  <button
                    aria-label={t("common.close")}
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-xl text-muted hover:bg-surface-muted"
                    onClick={() => setSelectedIndex(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white">
              <button
                aria-label={t("suggestionHelper.previousPhoto")}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25 disabled:opacity-40"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(selectedIndex - 1)}
                type="button"
              >
                ←
              </button>
              <span className="text-sm">
                {selectedIndex + 1} / {photoUrls.length}
              </span>
              <button
                aria-label={t("suggestionHelper.nextPhoto")}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25 disabled:opacity-40"
                disabled={selectedIndex === photoUrls.length - 1}
                onClick={() => setSelectedIndex(selectedIndex + 1)}
                type="button"
              >
                →
              </button>
              </div>
              <a
                className="text-sm font-semibold text-white underline"
                href={suggestion.googleMapsUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("tripDetails.openGoogleMaps")}
              </a>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
