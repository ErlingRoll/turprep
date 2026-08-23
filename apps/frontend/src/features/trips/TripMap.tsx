import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { importLibrary, setOptions } from "@googlemaps/js-api-loader"
import {
  getGooglePlaceDetails,
  getGooglePlacePhoto,
  type GooglePlaceDetails,
} from "../../api"
import { formatDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import { MobileMenuButton } from "../../components/MobileMenuButton"

export type TripMapMarker = {
  id: string
  type: "activity" | "meal" | "housing"
  title: string
  date: string
  latitude: number
  longitude: number
  googleMapsUrl?: string | null
}

type TripMapProps = {
  accessToken: string
  markers: TripMapMarker[]
  renderMarkerDetails?: (marker: TripMapMarker) => ReactNode
  onMarkerClick?: (marker: TripMapMarker) => void
  onMarkerLocationSave?: (
    marker: TripMapMarker,
    latitude: number,
    longitude: number,
  ) => Promise<void>
  focusMarker?: TripMapMarker | null
  onFocusMarkerHandled?: () => void
  fullScreen?: boolean
  fullScreenToolbar?: ReactNode
}

const markerDetailsAnimationDuration = 180

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function bringMarkerToFront(markers: Map<string, google.maps.Marker>, marker: TripMapMarker) {
  markers.forEach((currentMarker) => {
    currentMarker.setZIndex(undefined)
  })
  markers.get(`${marker.type}:${marker.id}`)?.setZIndex(google.maps.Marker.MAX_ZINDEX + 1)
}

function fitMapToMarkers(map: google.maps.Map, markers: TripMapMarker[]) {
  if (markers.length === 0) {
    return
  }

  if (markers.length === 1) {
    const center = { lat: markers[0].latitude, lng: markers[0].longitude }
    if (prefersReducedMotion()) {
      map.setCenter(center)
    } else {
      map.panTo(center)
    }
    map.setZoom(13)
    return
  }

  const bounds = new google.maps.LatLngBounds()
  markers.forEach((marker) => bounds.extend({ lat: marker.latitude, lng: marker.longitude }))
  map.fitBounds(bounds, 56)
  const listener = map.addListener("idle", () => {
    if ((map.getZoom() ?? 0) > 13) {
      map.setZoom(13)
    }
    listener.remove()
  })
}

function getMarkerLabel(title: string) {
  const maxLength = 20
  return title.length > maxLength ? `${title.slice(0, maxLength - 1).trimEnd()}…` : title
}

function markerColor(type: TripMapMarker["type"]) {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-type-${type}`)
    .trim()

  if (!color) {
    throw new Error(`Missing map marker color for ${type}`)
  }

  return color
}

function markerIcon(marker: TripMapMarker): google.maps.Icon {
  const label = getMarkerLabel(marker.title)
  const width = Math.max(56, Math.min(190, label.length * 7 + 24))
  const encodedLabel = label
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
  const color = markerColor(marker.type)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="42" viewBox="0 0 ${width} 42"><rect x="1" y="1" width="${width - 2}" height="29" rx="15" fill="${color}" stroke="#faf8f3" stroke-width="2"/><path d="M${width / 2 - 8} 29h16l-8 12z" fill="${color}" stroke="#faf8f3" stroke-width="2" stroke-linejoin="round"/><text x="${width / 2}" y="20" fill="#faf8f3" font-family="Arial,sans-serif" font-size="11" font-weight="700" text-anchor="middle">${encodedLabel}</text></svg>`

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, 42),
    anchor: new google.maps.Point(width / 2, 42),
  }
}

function formatGoogleValue(value: string) {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase()
    .replace(/^\w/, (character) => character.toLocaleUpperCase())
}

function formatGooglePriceLevel(priceLevel: string) {
  return {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "€",
    PRICE_LEVEL_MODERATE: "€€",
    PRICE_LEVEL_EXPENSIVE: "€€€",
    PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
  }[priceLevel] ?? formatGoogleValue(priceLevel)
}

export function TripMap({
  accessToken,
  markers,
  renderMarkerDetails,
  onMarkerClick,
  onMarkerLocationSave,
  focusMarker,
  onFocusMarkerHandled,
  fullScreen = false,
  fullScreenToolbar,
}: TripMapProps) {
  const { t } = useTranslation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [selectedMarker, setSelectedMarker] = useState<TripMapMarker | null>(null)
  const [googlePlaceDetails, setGooglePlaceDetails] = useState<GooglePlaceDetails | null>(null)
  const [googlePlaceError, setGooglePlaceError] = useState<string | null>(null)
  const [isLoadingGooglePlace, setIsLoadingGooglePlace] = useState(false)
  const [googlePlacePhotoUrls, setGooglePlacePhotoUrls] = useState<string[]>([])
  const [googlePlacePhotoError, setGooglePlacePhotoError] = useState<string | null>(null)
  const [isMarkerDetailsClosing, setIsMarkerDetailsClosing] = useState(false)
  const [isLocationEditMode, setIsLocationEditMode] = useState(false)
  const [draftLocation, setDraftLocation] = useState<{
    marker: TripMapMarker
    latitude: number
    longitude: number
    originalLatitude: number
    originalLongitude: number
  } | null>(null)
  const [isSavingLocation, setIsSavingLocation] = useState(false)
  const [locationEditError, setLocationEditError] = useState<string | null>(null)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const hasDesktopDetailsPanel = Boolean(selectedMarker && renderMarkerDetails)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRefs = useRef<Map<string, google.maps.Marker>>(new Map())
  const markerDetailsCloseTimeoutRef = useRef<number | null>(null)
  const renderMarkerDetailsRef = useRef(renderMarkerDetails)
  const onMarkerClickRef = useRef(onMarkerClick)
  const onMarkerLocationSaveRef = useRef(onMarkerLocationSave)
  const onFocusMarkerHandledRef = useRef(onFocusMarkerHandled)
  const isLocationEditModeRef = useRef(isLocationEditMode)
  renderMarkerDetailsRef.current = renderMarkerDetails
  onMarkerClickRef.current = onMarkerClick
  onMarkerLocationSaveRef.current = onMarkerLocationSave
  onFocusMarkerHandledRef.current = onFocusMarkerHandled
  isLocationEditModeRef.current = isLocationEditMode

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let isCancelled = false
    const markerMap = markerRefs.current
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      setMapLoadError(t("tripMap.googleMapsUnavailable"))
      return
    }

    setOptions({
      key: apiKey,
      language: "en",
      v: "weekly",
    })

    void Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(() => {
        if (isCancelled || !containerRef.current) {
          return
        }

        setMapLoadError(null)
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: 59.9139, lng: 10.7522 },
          fullscreenControl: false,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 2,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
        })
        mapRef.current = map
        setIsMapReady(true)
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setMapLoadError(t("tripMap.googleMapsUnavailable"))
          console.error("Unable to load Google Maps.", error)
        }
      })

    return () => {
      isCancelled = true
      markerMap.forEach((marker) => marker.setMap(null))
      markerMap.clear()
      mapRef.current = null
      setIsMapReady(false)
    }
  }, [t])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isMapReady) {
      return
    }

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current.clear()

    if (markers.length === 0) {
      return
    }

    markers.forEach((marker) => {
      const mapMarker = new google.maps.Marker({
        draggable: isLocationEditModeRef.current,
        icon: markerIcon(marker),
        map,
        position: { lat: marker.latitude, lng: marker.longitude },
        title: `${marker.title}, ${formatDate(marker.date)}`,
      })

      mapMarker.addListener("click", () => {
        bringMarkerToFront(markerRefs.current, marker)

        if (isLocationEditModeRef.current) {
          return
        }

        if (window.innerWidth >= 1024) {
          onMarkerClickRef.current?.(marker)
          if (renderMarkerDetailsRef.current) {
            setSelectedMarker(marker)
          }
          return
        }

        if (!renderMarkerDetailsRef.current) {
          return
        }

        if (markerDetailsCloseTimeoutRef.current !== null) {
          window.clearTimeout(markerDetailsCloseTimeoutRef.current)
          markerDetailsCloseTimeoutRef.current = null
        }
        setIsMarkerDetailsClosing(false)
        setSelectedMarker(marker)
      })

      mapMarker.addListener("dragend", () => {
        if (!isLocationEditModeRef.current) {
          return
        }

        const position = mapMarker.getPosition()
        if (!position) {
          return
        }

        setDraftLocation((currentDraft) => ({
          marker,
          latitude: position.lat(),
          longitude: position.lng(),
          originalLatitude:
            currentDraft?.marker.id === marker.id ? currentDraft.originalLatitude : marker.latitude,
          originalLongitude:
            currentDraft?.marker.id === marker.id
              ? currentDraft.originalLongitude
              : marker.longitude,
        }))
        setLocationEditError(null)
      })

      markerRefs.current.set(`${marker.type}:${marker.id}`, mapMarker)
    })

    fitMapToMarkers(map, markers)
  }, [isMapReady, markers])

  useEffect(() => {
    markerRefs.current.forEach((marker) => marker.setDraggable(isLocationEditMode))

    if (!isLocationEditMode) {
      setDraftLocation(null)
      setLocationEditError(null)
    }
  }, [isLocationEditMode])

  useEffect(() => {
    setSelectedMarker((currentMarker) =>
      currentMarker && markers.some((marker) => marker.id === currentMarker.id)
        ? currentMarker
        : null,
    )
  }, [markers])

  useEffect(() => {
    let isCancelled = false
    const googleMapsUrl = selectedMarker?.googleMapsUrl

    setGooglePlaceDetails(null)
    setGooglePlaceError(null)
    setIsLoadingGooglePlace(false)

    if (!googleMapsUrl) {
      return
    }

    setIsLoadingGooglePlace(true)
    void getGooglePlaceDetails(accessToken, googleMapsUrl)
      .then((details) => {
        if (!isCancelled) {
          setGooglePlaceDetails(details)
        }
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setGooglePlaceError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingGooglePlace(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [accessToken, selectedMarker?.googleMapsUrl])

  useEffect(() => {
    let isCancelled = false
    const photos = googlePlaceDetails?.photos.slice(0, 4) ?? []

    setGooglePlacePhotoUrls([])
    setGooglePlacePhotoError(null)

    if (photos.length === 0) {
      return
    }

    void Promise.all(
      photos.map((photo) =>
        getGooglePlacePhoto(accessToken, photo.name).then((blob) => URL.createObjectURL(blob)),
      ),
    )
      .then((photoUrls) => {
        if (!isCancelled) {
          setGooglePlacePhotoUrls(photoUrls)
        } else {
          photoUrls.forEach((photoUrl) => URL.revokeObjectURL(photoUrl))
        }
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setGooglePlacePhotoError(getErrorMessage(reason))
        }
      })

    return () => {
      isCancelled = true
      setGooglePlacePhotoUrls((photoUrls) => {
        photoUrls.forEach((photoUrl) => URL.revokeObjectURL(photoUrl))
        return []
      })
    }
  }, [accessToken, googlePlaceDetails])

  useEffect(() => {
    if (!focusMarker || !mapRef.current || !isMapReady) {
      return
    }

    bringMarkerToFront(markerRefs.current, focusMarker)

    const focusMap = () => {
      if (!mapRef.current) {
        return
      }

      const center = { lat: focusMarker.latitude, lng: focusMarker.longitude }
      if (prefersReducedMotion()) {
        mapRef.current.setCenter(center)
      } else {
        mapRef.current.panTo(center)
      }
      mapRef.current.setZoom(14)
      onFocusMarkerHandledRef.current?.()
    }

    if (window.innerWidth < 1024) {
      setIsMobileOpen(true)
      requestAnimationFrame(() => requestAnimationFrame(focusMap))
      return
    }

    focusMap()
  }, [focusMarker, isMapReady])

  useEffect(() => {
    if (!isMobileOpen || !mapRef.current) {
      return
    }

    const frame = requestAnimationFrame(() => {
      const map = mapRef.current

      if (!map) {
        return
      }

      google.maps.event.trigger(map, "resize")
      fitMapToMarkers(map, markers)
    })

    return () => cancelAnimationFrame(frame)
  }, [isMobileOpen, markers, selectedMarker])

  useEffect(
    () => () => {
      if (markerDetailsCloseTimeoutRef.current !== null) {
        window.clearTimeout(markerDetailsCloseTimeoutRef.current)
      }
    },
    [],
  )

  function closeMarkerDetails() {
    setIsMarkerDetailsClosing(true)
    if (markerDetailsCloseTimeoutRef.current !== null) {
      window.clearTimeout(markerDetailsCloseTimeoutRef.current)
    }
    markerDetailsCloseTimeoutRef.current = window.setTimeout(() => {
      setSelectedMarker(null)
      setIsMarkerDetailsClosing(false)
      markerDetailsCloseTimeoutRef.current = null
    }, markerDetailsAnimationDuration)
  }

  function renderGooglePlaceDetails() {
    if (!selectedMarker?.googleMapsUrl) {
      return null
    }

    if (isLoadingGooglePlace) {
      return (
        <p className="rounded-xl bg-surface-soft p-3 text-sm text-muted">
          {t("tripMap.googleDetailsLoading")}
        </p>
      )
    }

    if (googlePlaceError) {
      return (
        <p className="rounded-xl bg-warning-surface p-3 text-sm text-warning-body" role="alert">
          {googlePlaceError}
        </p>
      )
    }

    if (!googlePlaceDetails) {
      return null
    }

    return (
      <section className="grid gap-3 rounded-xl bg-surface-soft p-3">
        <div>
          <h3 className="font-semibold text-brand">{googlePlaceDetails.name}</h3>
          <p className="mt-1 text-sm text-muted">{googlePlaceDetails.address}</p>
          {googlePlaceDetails.category && (
            <p className="mt-1 text-sm text-muted">{googlePlaceDetails.category}</p>
          )}
        </div>
        {googlePlaceDetails.summary && (
          <p className="text-sm leading-6 text-on-surface">{googlePlaceDetails.summary}</p>
        )}
        {(googlePlaceDetails.businessStatus || googlePlaceDetails.priceLevel) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {googlePlaceDetails.businessStatus && (
              <span>
                {t("tripMap.businessStatus")}: {formatGoogleValue(googlePlaceDetails.businessStatus)}
              </span>
            )}
            {googlePlaceDetails.priceLevel && (
              <span>
                {t("tripMap.priceLevel")}: {formatGooglePriceLevel(googlePlaceDetails.priceLevel)}
              </span>
            )}
          </div>
        )}
        {googlePlaceDetails.phoneNumber && (
          <a
            className="text-sm font-semibold text-brand underline"
            href={`tel:${googlePlaceDetails.phoneNumber}`}
          >
            {googlePlaceDetails.phoneNumber}
          </a>
        )}
        {googlePlaceDetails.websiteUrl && (
          <a
            className="break-all text-sm font-semibold text-brand underline"
            href={googlePlaceDetails.websiteUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("tripMap.website")}
          </a>
        )}
        {googlePlaceDetails.rating !== null && (
          <p className="text-sm text-on-surface">
            {t("tripMap.rating")}: {googlePlaceDetails.rating.toFixed(1)} / 5
            {googlePlaceDetails.userRatingCount !== null
              ? ` (${googlePlaceDetails.userRatingCount.toLocaleString()})`
              : ""}
          </p>
        )}
        {googlePlaceDetails.openingHours && (
          <div className="text-sm text-on-surface">
            <p className="font-semibold">{t("tripMap.openingHours")}</p>
            <p className="mt-1 text-muted">
              {googlePlaceDetails.openingHours.openNow === null
                ? ""
                : googlePlaceDetails.openingHours.openNow
                  ? t("tripMap.openNow")
                  : t("tripMap.closedNow")}
            </p>
            <ul className="mt-1 grid gap-0.5 text-muted">
              {googlePlaceDetails.openingHours.weekdayDescriptions.map((description) => (
                <li key={description}>{description}</li>
              ))}
            </ul>
          </div>
        )}
        {googlePlacePhotoError && (
          <p className="text-sm text-muted" role="status">
            {t("tripMap.photosUnavailable")}
          </p>
        )}
        {googlePlacePhotoUrls.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {googlePlacePhotoUrls.map((photoUrl) => (
              <img
                alt={googlePlaceDetails.name}
                className="aspect-square w-full rounded-lg object-cover"
                key={photoUrl}
                src={photoUrl}
              />
            ))}
          </div>
        )}
        <a
          className="text-sm font-semibold text-brand underline"
          href={selectedMarker.googleMapsUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("tripDetails.openGoogleMaps")}
        </a>
      </section>
    )
  }

  function resetMapView() {
    if (mapRef.current) {
      fitMapToMarkers(mapRef.current, markers)
    }
  }

  function renderLegend() {
    return (
      <>
        <span className="font-semibold">{t("tripMap.legend")}</span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-type-activity" />
          {t("tripMap.activity")}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-type-meal" />
          {t("tripMap.meal")}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-type-housing" />
          {t("tripMap.housing")}
        </span>
      </>
    )
  }

  function cancelLocationEdit() {
    if (draftLocation) {
      markerRefs.current
        .get(`${draftLocation.marker.type}:${draftLocation.marker.id}`)
        ?.setPosition({
          lat: draftLocation.originalLatitude,
          lng: draftLocation.originalLongitude,
        })
    }
    setDraftLocation(null)
    setLocationEditError(null)
    setIsLocationEditMode(false)
  }

  async function saveLocationEdit() {
    if (!draftLocation || !onMarkerLocationSaveRef.current) {
      return
    }

    setIsSavingLocation(true)
    setLocationEditError(null)
    try {
      await onMarkerLocationSaveRef.current(
        draftLocation.marker,
        draftLocation.latitude,
        draftLocation.longitude,
      )
      setDraftLocation(null)
      setIsLocationEditMode(false)
    } catch {
      const mapMarker = markerRefs.current.get(
        `${draftLocation.marker.type}:${draftLocation.marker.id}`,
      )
      mapMarker?.setPosition({
        lat: draftLocation.originalLatitude,
        lng: draftLocation.originalLongitude,
      })
      setLocationEditError(t("tripMap.locationSaveFailed"))
    } finally {
      setIsSavingLocation(false)
    }
  }

  return (
    <>
      <button
        aria-expanded={isMobileOpen}
        className={`fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-on-brand shadow-card ${
          fullScreen ? "hidden" : "lg:hidden"
        }`}
        onClick={() => {
          if (markerDetailsCloseTimeoutRef.current !== null) {
            window.clearTimeout(markerDetailsCloseTimeoutRef.current)
            markerDetailsCloseTimeoutRef.current = null
          }
          setIsMarkerDetailsClosing(false)
          setSelectedMarker(null)
          setIsMobileOpen(true)
        }}
        type="button"
      >
        {t("tripMap.open")}
      </button>
      <section
        className={
          fullScreen
            ? "fixed inset-0 z-40 flex h-dvh flex-col rounded-none border-0 bg-surface p-0"
            : `${
                isMobileOpen
                  ? "fixed inset-0 z-50 flex h-dvh flex-col rounded-none"
                  : "hidden rounded-2xl lg:flex"
              } border border-border-card bg-surface p-3 pb-24 lg:sticky lg:top-24 lg:h-[calc(100dvh-24rem)] lg:min-h-96 lg:flex-col lg:pb-3`
        }
      >
        <div
          className={
            fullScreen
              ? `absolute top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-1.5 rounded-xl bg-surface/95 p-4 shadow-card backdrop-blur-sm transition-[left] duration-200 ${
                  hasDesktopDetailsPanel ? "left-[20.75rem]" : "left-3"
                }`
              : "hidden shrink-0 items-center justify-between gap-3 px-1 lg:flex"
          }
        >
          {fullScreenToolbar}
          <div
            className={
              fullScreen
                ? "flex flex-wrap items-center justify-between gap-2 border-t border-border-divider pt-1"
                : "flex items-center justify-between gap-3"
            }
          >
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-brand">{t("tripMap.title")}</h2>
              <span className="text-xs text-muted">
                {t("tripMap.locations", { count: markers.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onMarkerLocationSave &&
                (isLocationEditMode ? (
                  <>
                    <button
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted disabled:opacity-60"
                      disabled={isSavingLocation}
                      onClick={cancelLocationEdit}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
                      disabled={!draftLocation || isSavingLocation}
                      onClick={() => void saveLocationEdit()}
                      type="button"
                    >
                      {isSavingLocation ? t("common.saving") : t("tripMap.saveLocation")}
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
                    onClick={() => {
                      setLocationEditError(null)
                      setIsLocationEditMode(true)
                    }}
                    type="button"
                  >
                    {t("tripMap.editLocations")}
                  </button>
                ))}
              {fullScreen && (
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
                  onClick={resetMapView}
                  type="button"
                >
                  {t("tripMap.reset")}
                </button>
              )}
            </div>
          </div>
          {fullScreen && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border-divider pt-1 text-xs text-muted">
              {renderLegend()}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside
            aria-hidden={!selectedMarker || !renderMarkerDetails}
            className={`hidden shrink-0 flex-col overflow-hidden border-border-divider transition-[width,opacity] duration-200 lg:flex ${
              selectedMarker && renderMarkerDetails
                ? "lg:w-80 lg:border-r lg:opacity-100"
                : "pointer-events-none lg:w-0 lg:border-r-0 lg:opacity-0"
            }`}
          >
            <div className="flex w-80 min-w-80 flex-1 flex-col gap-3 overflow-y-auto p-3">
              {selectedMarker && renderMarkerDetails && (
                <>
                  <div className="flex shrink-0 items-center justify-between gap-3">
                    <h2 className="font-semibold text-brand">{t("tripMap.locationDetails")}</h2>
                    <MobileMenuButton
                      closeLabel={t("tripMap.closeDetails")}
                      isOpen
                      menuLabel={t("tripMap.closeDetails")}
                      onToggle={closeMarkerDetails}
                      openLabel={t("tripMap.closeDetails")}
                      showOnDesktop
                    />
                  </div>
                  <div className="trip-map-marker-details">{renderMarkerDetails(selectedMarker)}</div>
                  {renderGooglePlaceDetails()}
                </>
              )}
            </div>
          </aside>
          <div
            className={`relative min-h-0 flex-1 overflow-hidden ${
              fullScreen ? "rounded-none" : "mt-0 rounded-xl lg:mt-3"
            }`}
          >
            <div className="h-full min-h-72 w-full" ref={containerRef} />
            {mapLoadError && (
              <div className="absolute inset-0 grid place-items-center bg-surface-muted/90 p-6 text-center text-sm text-error">
                {mapLoadError}
              </div>
            )}
            {isLocationEditMode && (
              <div
                className={`absolute z-10 max-w-64 rounded-lg bg-surface/95 px-3 py-2 text-xs text-on-surface shadow-card transition-[left] duration-200 ${
                  fullScreen
                    ? `top-32 ${hasDesktopDetailsPanel ? "left-[20.75rem]" : "left-3"}`
                    : "left-3 top-14"
                }`}
              >
                {draftLocation ? t("tripMap.locationReadyToSave") : t("tripMap.locationEditHelp")}
                {locationEditError && (
                  <p className="mt-1 text-error-strong" role="alert">
                    {locationEditError}
                  </p>
                )}
              </div>
            )}
            <button
              className={`absolute right-3 z-10 rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-on-surface shadow-card hover:bg-surface-muted ${
                fullScreen ? "hidden" : "top-3"
              }`}
              onClick={resetMapView}
              type="button"
            >
              {t("tripMap.reset")}
            </button>
            {!fullScreen && (
              <div className="absolute bottom-3 left-3 z-10 grid gap-1 rounded-lg bg-surface/95 px-3 py-2 text-xs text-on-surface shadow-card">
                {renderLegend()}
              </div>
            )}
            {markers.length === 0 && (
              <div className="absolute inset-0 grid place-items-center bg-surface-muted/80 p-6 text-center text-sm text-muted">
                {t("tripMap.noLocations")}
              </div>
            )}
          </div>
        </div>
        <div
          className={`order-first mt-3 flex shrink-0 items-center justify-between gap-3 px-1 lg:hidden ${
            fullScreen ? "hidden" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-brand">{t("tripMap.title")}</h2>
            <span className="text-xs text-muted">
              {t("tripMap.locations", { count: markers.length })}
            </span>
          </div>
          {onMarkerLocationSave && (
            <div className="flex items-center gap-2">
              {isLocationEditMode ? (
                <>
                  <button
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted disabled:opacity-60"
                    disabled={isSavingLocation}
                    onClick={cancelLocationEdit}
                    type="button"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
                    disabled={!draftLocation || isSavingLocation}
                    onClick={() => void saveLocationEdit()}
                    type="button"
                  >
                    {isSavingLocation ? t("common.saving") : t("tripMap.saveLocation")}
                  </button>
                </>
              ) : (
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
                  onClick={() => {
                    setLocationEditError(null)
                    setIsLocationEditMode(true)
                  }}
                  type="button"
                >
                  {t("tripMap.editLocations")}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="fixed bottom-20 right-3 z-[70] lg:hidden">
          <MobileMenuButton
            closeLabel={t("tripMap.close")}
            isOpen
            menuLabel={t("tripMap.close")}
            onToggle={() => {
              setSelectedMarker(null)
              setIsMobileOpen(false)
            }}
            openLabel={t("tripMap.close")}
            showOnDesktop
          />
        </div>
      </section>
      {selectedMarker && renderMarkerDetails && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] p-3 lg:hidden">
          <div
            className={`trip-map-marker-details pointer-events-auto mx-auto max-w-xl${
              isMarkerDetailsClosing ? " trip-map-marker-details-closing" : ""
            }`}
          >
            {renderMarkerDetails(selectedMarker)}
            <div className="flex justify-end pt-2">
              <MobileMenuButton
                closeLabel={t("tripMap.closeDetails")}
                isOpen
                menuLabel={t("tripMap.closeDetails")}
                onToggle={closeMarkerDetails}
                openLabel={t("tripMap.closeDetails")}
                showOnDesktop
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
