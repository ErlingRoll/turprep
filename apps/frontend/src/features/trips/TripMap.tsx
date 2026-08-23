import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  getGooglePlaceDetails,
  getGooglePlacePhoto,
  type GooglePlaceDetails,
  type GooglePlaceSuggestion,
} from "../../api"
import { formatDate } from "../../lib/date-format"
import { formatGooglePriceLevel } from "../../lib/google-place-format"
import { getErrorMessage } from "../../lib/errors"
import { loadGoogleMaps } from "../../lib/google-maps"
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
  renderSuggestionDetails?: (suggestion: GooglePlaceSuggestion) => ReactNode
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
  onMapClick?: (point: { latitude: number; longitude: number }) => void
  onSuggestionModeToggle?: () => void
  onSuggestionMarkerClick?: (suggestion: GooglePlaceSuggestion) => void
  suggestionMode?: boolean
  suggestionMarkers?: GooglePlaceSuggestion[]
  selectedSuggestionPlaceId?: string | null
  selectedSuggestion?: GooglePlaceSuggestion | null
  suggestionPanel?: ReactNode
  suggestionPin?: { latitude: number; longitude: number } | null
}

const markerDetailsAnimationDuration = 180
const markerZIndex = 1_000_000
const suggestionFlagCursor = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7 28V4" stroke="#9a3412" stroke-width="2"/><path d="M8 5h16l-5 6 5 6H8z" fill="#c2410c" stroke="#fff7ed" stroke-width="2"/></svg>',
)}") 7 4, crosshair`

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

type MapMarker = google.maps.marker.AdvancedMarkerElement

function bringMarkerToFront(markers: Map<string, MapMarker>, marker: TripMapMarker) {
  markers.forEach((currentMarker) => {
    currentMarker.zIndex = null
  })
  const selectedMarker = markers.get(`${marker.type}:${marker.id}`)
  if (selectedMarker) {
    selectedMarker.zIndex = markerZIndex + 1
  }
}

function createMarkerContent(icon: google.maps.Icon) {
  const content = document.createElement("img")
  content.alt = ""
  content.setAttribute("aria-hidden", "true")
  content.draggable = false
  content.src = icon.url
  content.style.display = "block"
  content.style.pointerEvents = "none"

  if (icon.scaledSize) {
    content.width = icon.scaledSize.width
    content.height = icon.scaledSize.height
  }

  return content
}

function createMapMarker(options: {
  icon: google.maps.Icon
  map: google.maps.Map
  position: google.maps.LatLngLiteral
  title: string
  zIndex?: number
  draggable?: boolean
  onClick?: () => void
  onDragEnd?: () => void
}) {
  const marker = new google.maps.marker.AdvancedMarkerElement({
    content: createMarkerContent(options.icon),
    gmpClickable: Boolean(options.onClick),
    gmpDraggable: options.draggable,
    map: options.map,
    position: options.position,
    title: options.title,
    zIndex: options.zIndex,
  })

  if (options.onClick) {
    marker.addEventListener("gmp-click", options.onClick)
  }
  if (options.onDragEnd) {
    marker.addListener("dragend", options.onDragEnd)
  }

  return marker
}

function setMarkerIcon(marker: MapMarker, icon: google.maps.Icon) {
  marker.replaceChildren(createMarkerContent(icon))
}

function detachMarker(marker: MapMarker) {
  marker.map = null
}

function getMarkerPosition(marker: MapMarker) {
  const position = marker.position
  if (!position) {
    return null
  }

  if (position instanceof google.maps.LatLng) {
    return { lat: position.lat(), lng: position.lng() }
  }

  return { lat: position.lat, lng: position.lng }
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

function suggestionMarkerIcon(
  suggestion: GooglePlaceSuggestion,
  isSelected: boolean,
): google.maps.Icon {
  const color = isSelected ? "#9a3412" : "#c2410c"
  if (!isSelected) {
    const compactSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M7 37V4" stroke="${color}" stroke-width="3"/><path d="M8 5h18l-6 7 6 7H8z" fill="${color}" stroke="#fff7ed" stroke-width="2"/></svg>`
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(compactSvg)}`,
      scaledSize: new google.maps.Size(32, 40),
      anchor: new google.maps.Point(7, 40),
    }
  }

  const label = getMarkerLabel(suggestion.name)
  const width = Math.max(112, Math.min(240, label.length * 7 + 54))
  const encodedLabel = label
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="48" viewBox="0 0 ${width} 48"><path d="M8 43V5" stroke="${color}" stroke-width="3"/><path d="M9 6h18l-6 7 6 7H9z" fill="${color}" stroke="#fff7ed" stroke-width="2"/><rect x="28" y="4" width="${width - 30}" height="29" rx="14" fill="${color}" stroke="#fff7ed" stroke-width="2"/><text x="${28 + (width - 30) / 2}" y="22" fill="#fff7ed" font-family="Arial,sans-serif" font-size="11" font-weight="700" text-anchor="middle">${encodedLabel}</text></svg>`

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, 48),
    anchor: new google.maps.Point(8, 48),
  }
}

function suggestionClusterIcon(count: number): google.maps.Icon {
  const label = count > 99 ? "99+" : String(count)
  const size = count > 99 ? 42 : 36
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#c2410c" stroke="#fff7ed" stroke-width="3"/><text x="${size / 2}" y="${size / 2 + 5}" fill="#fff7ed" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle">${label}</text></svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  }
}

function suggestionSearchPinIcon(): google.maps.Icon {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="64" viewBox="0 0 52 64"><circle cx="18" cy="54" r="7" fill="#1e293b" stroke="#fff" stroke-width="3"/><path d="M18 55V7" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/><path d="M20 8h26l-8 10 8 10H20z" fill="#facc15" stroke="#1e293b" stroke-width="3" stroke-linejoin="round"/><circle cx="18" cy="54" r="2" fill="#fff"/></svg>'
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(52, 64),
    anchor: new google.maps.Point(18, 54),
  }
}

function formatGoogleValue(value: string) {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase()
    .replace(/^\w/, (character) => character.toLocaleUpperCase())
}

export function TripMap({
  accessToken,
  markers,
  renderMarkerDetails,
  renderSuggestionDetails,
  onMarkerClick,
  onMarkerLocationSave,
  focusMarker,
  onFocusMarkerHandled,
  fullScreen = false,
  fullScreenToolbar,
  onMapClick,
  onSuggestionModeToggle,
  onSuggestionMarkerClick,
  suggestionMode = false,
  suggestionMarkers = [],
  selectedSuggestionPlaceId = null,
  selectedSuggestion = null,
  suggestionPanel,
  suggestionPin = null,
}: TripMapProps) {
  const { t } = useTranslation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [selectedMarker, setSelectedMarker] = useState<TripMapMarker | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState<GooglePlaceSuggestion | null>(
    selectedSuggestion,
  )
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
  const hasDesktopDetailsPanel = Boolean(
    (selectedMarker && renderMarkerDetails) || (activeSuggestion && renderSuggestionDetails),
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef(markers)
  const markerRefs = useRef<Map<string, MapMarker>>(new Map())
  const hasFittedMarkerViewportRef = useRef(false)
  const markerDetailsCloseTimeoutRef = useRef<number | null>(null)
  const suggestionPinRef = useRef<MapMarker | null>(null)
  const suggestionMarkerRefs = useRef<Map<string, MapMarker>>(new Map())
  const renderMarkerDetailsRef = useRef(renderMarkerDetails)
  const onMarkerClickRef = useRef(onMarkerClick)
  const onMarkerLocationSaveRef = useRef(onMarkerLocationSave)
  const onFocusMarkerHandledRef = useRef(onFocusMarkerHandled)
  const onSuggestionMarkerClickRef = useRef(onSuggestionMarkerClick)
  const isLocationEditModeRef = useRef(isLocationEditMode)
  markersRef.current = markers
  renderMarkerDetailsRef.current = renderMarkerDetails
  onMarkerClickRef.current = onMarkerClick
  onMarkerLocationSaveRef.current = onMarkerLocationSave
  onFocusMarkerHandledRef.current = onFocusMarkerHandled
  onSuggestionMarkerClickRef.current = onSuggestionMarkerClick
  isLocationEditModeRef.current = isLocationEditMode

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    let isCancelled = false
    const markerMap = markerRefs.current
    const suggestionMarkerMap = suggestionMarkerRefs.current
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      setMapLoadError(t("tripMap.googleMapsUnavailable"))
      return
    }

    void loadGoogleMaps(apiKey)
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
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
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
      markerMap.forEach(detachMarker)
      markerMap.clear()
      suggestionMarkerMap.forEach(detachMarker)
      suggestionMarkerMap.clear()
      if (suggestionPinRef.current) {
        detachMarker(suggestionPinRef.current)
      }
      suggestionPinRef.current = null
      mapRef.current = null
      hasFittedMarkerViewportRef.current = false
      setIsMapReady(false)
    }
  }, [t])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isMapReady) {
      return
    }

    markerRefs.current.forEach(detachMarker)
    markerRefs.current.clear()

    if (markers.length === 0) {
      return
    }

    markers.forEach((marker) => {
      const mapMarker = createMapMarker({
        draggable: isLocationEditModeRef.current,
        icon: markerIcon(marker),
        map,
        onClick: () => {
          bringMarkerToFront(markerRefs.current, marker)

          if (isLocationEditModeRef.current) {
            return
          }

          if (window.innerWidth >= 1024) {
            onMarkerClickRef.current?.(marker)
            setActiveSuggestion(null)
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
          setActiveSuggestion(null)
          setSelectedMarker(marker)
        },
        onDragEnd: () => {
          if (!isLocationEditModeRef.current) {
            return
          }

          const position = getMarkerPosition(mapMarker)
          if (!position) {
            return
          }

          setDraftLocation((currentDraft) => ({
            marker,
            latitude: position.lat,
            longitude: position.lng,
            originalLatitude:
              currentDraft?.marker.id === marker.id ? currentDraft.originalLatitude : marker.latitude,
            originalLongitude:
              currentDraft?.marker.id === marker.id
                ? currentDraft.originalLongitude
                : marker.longitude,
          }))
          setLocationEditError(null)
        },
        position: { lat: marker.latitude, lng: marker.longitude },
        title: `${marker.title}, ${formatDate(marker.date)}`,
      })

      markerRefs.current.set(`${marker.type}:${marker.id}`, mapMarker)
    })

    if (!hasFittedMarkerViewportRef.current) {
      fitMapToMarkers(map, markers)
      if (markers.length > 0) {
        hasFittedMarkerViewportRef.current = true
      }
      return
    }

    const center = map.getCenter()?.toJSON()
    const zoom = map.getZoom()
    if (center && zoom !== undefined) {
      map.setCenter(center)
      map.setZoom(zoom)
    }
  }, [isMapReady, markers])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isMapReady) {
      return
    }

    suggestionMarkerRefs.current.forEach(detachMarker)
    suggestionMarkerRefs.current.clear()

    const groups = new Map<string, GooglePlaceSuggestion[]>()
    const gridSize = 0.004
    suggestionMarkers.forEach((suggestion) => {
      const key = `${Math.floor(suggestion.latitude / gridSize)}:${Math.floor(
        suggestion.longitude / gridSize,
      )}`
      groups.set(key, [...(groups.get(key) ?? []), suggestion])
    })

    groups.forEach((group, groupKey) => {
      if (group.length > 1 && !group.some((suggestion) => suggestion.placeId === selectedSuggestionPlaceId)) {
        const position = {
          lat: group.reduce((total, suggestion) => total + suggestion.latitude, 0) / group.length,
          lng: group.reduce((total, suggestion) => total + suggestion.longitude, 0) / group.length,
        }
        const clusterMarker = createMapMarker({
          icon: suggestionClusterIcon(group.length),
          map,
          onClick: () => {
            map.panTo(position)
            map.setZoom(Math.min((map.getZoom() ?? 13) + 2, 20))
          },
          position,
          title: `${group.length} suggestions`,
          zIndex: markerZIndex + 1,
        })
        suggestionMarkerRefs.current.set(`cluster:${groupKey}`, clusterMarker)
        return
      }

      group.forEach((suggestion) => {
        const mapMarker = createMapMarker({
          icon: suggestionMarkerIcon(suggestion, suggestion.placeId === selectedSuggestionPlaceId),
          map,
          onClick: () => {
            setSelectedMarker(null)
            setActiveSuggestion(suggestion)
            onSuggestionMarkerClickRef.current?.(suggestion)
          },
          position: { lat: suggestion.latitude, lng: suggestion.longitude },
          title: suggestion.name,
          zIndex:
            suggestion.placeId === selectedSuggestionPlaceId ? markerZIndex + 3 : undefined,
        })
        suggestionMarkerRefs.current.set(suggestion.placeId, mapMarker)
      })
    })
  }, [isMapReady, selectedSuggestionPlaceId, suggestionMarkers])

  useEffect(() => {
    setActiveSuggestion(selectedSuggestion)
    if (selectedSuggestion) {
      setSelectedMarker(null)
    }
  }, [selectedSuggestion])

  useEffect(() => {
    const map = mapRef.current
    const selectedSuggestion = suggestionMarkers.find(
      (suggestion) => suggestion.placeId === selectedSuggestionPlaceId,
    )

    suggestionMarkerRefs.current.forEach((marker, placeId) => {
      const suggestion = suggestionMarkers.find((candidate) => candidate.placeId === placeId)
      if (!suggestion) {
        return
      }

      const isSelected = placeId === selectedSuggestionPlaceId
      setMarkerIcon(marker, suggestionMarkerIcon(suggestion, isSelected))
      marker.zIndex = isSelected ? markerZIndex + 3 : null
    })

    if (map && selectedSuggestion) {
      const center = { lat: selectedSuggestion.latitude, lng: selectedSuggestion.longitude }
      if (prefersReducedMotion()) {
        map.setCenter(center)
      } else {
        map.panTo(center)
      }
      map.setZoom(15)
    }
  }, [selectedSuggestionPlaceId, suggestionMarkers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) {
      return
    }

    if (!suggestionPin) {
      if (suggestionPinRef.current) {
        detachMarker(suggestionPinRef.current)
      }
      return
    }

    if (!suggestionPinRef.current) {
      suggestionPinRef.current = createMapMarker({
        icon: suggestionSearchPinIcon(),
        map,
        position: { lat: suggestionPin.latitude, lng: suggestionPin.longitude },
        title: t("suggestionHelper.pin"),
        zIndex: markerZIndex + 2,
      })
      return
    }

    suggestionPinRef.current.map = map
    suggestionPinRef.current.position = {
      lat: suggestionPin.latitude,
      lng: suggestionPin.longitude,
    }
  }, [isMapReady, suggestionPin, t])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady || !onMapClick) {
      return
    }

    const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) {
        return
      }

      onMapClick({
        latitude: event.latLng.lat(),
        longitude: event.latLng.lng(),
      })
    })

    return () => listener.remove()
  }, [isMapReady, onMapClick])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) {
      return
    }

    const mapElement = map.getDiv()
    mapElement.style.cursor = suggestionMode ? suggestionFlagCursor : ""

    return () => {
      mapElement.style.cursor = ""
    }
  }, [isMapReady, suggestionMode])

  useEffect(() => {
    markerRefs.current.forEach((marker) => {
      marker.gmpDraggable = isLocationEditMode
    })

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
    const googleMapsUrl = selectedMarker?.googleMapsUrl ?? activeSuggestion?.googleMapsUrl

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
  }, [accessToken, activeSuggestion?.googleMapsUrl, selectedMarker?.googleMapsUrl])

  useEffect(() => {
    let isCancelled = false
    const photos = activeSuggestion ? [] : (googlePlaceDetails?.photos.slice(0, 4) ?? [])

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
  }, [accessToken, activeSuggestion, googlePlaceDetails])

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
      fitMapToMarkers(map, markersRef.current)
    })

    return () => cancelAnimationFrame(frame)
  }, [isMobileOpen, selectedMarker])

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
      setActiveSuggestion(null)
      setIsMarkerDetailsClosing(false)
      markerDetailsCloseTimeoutRef.current = null
    }, markerDetailsAnimationDuration)
  }

  function renderGooglePlaceDetails() {
    const googleMapsUrl = selectedMarker?.googleMapsUrl ?? activeSuggestion?.googleMapsUrl

    if (!googleMapsUrl) {
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
                {t("tripMap.priceLevel")}: {formatGooglePriceLevel(googlePlaceDetails.priceLevel, t)}
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
        {!activeSuggestion && googlePlacePhotoError && (
          <p className="text-sm text-muted" role="status">
            {t("tripMap.photosUnavailable")}
          </p>
        )}
        {!activeSuggestion && googlePlacePhotoUrls.length > 0 && (
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
          href={googleMapsUrl}
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
      fitMapToMarkers(mapRef.current, markersRef.current)
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
      const mapMarker = markerRefs.current.get(
        `${draftLocation.marker.type}:${draftLocation.marker.id}`,
      )
      if (mapMarker) {
        mapMarker.position = {
          lat: draftLocation.originalLatitude,
          lng: draftLocation.originalLongitude,
        }
      }
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
      if (mapMarker) {
        mapMarker.position = {
          lat: draftLocation.originalLatitude,
          lng: draftLocation.originalLongitude,
        }
      }
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
                  hasDesktopDetailsPanel ? "left-[18.75rem]" : "left-3"
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
            aria-hidden={!hasDesktopDetailsPanel}
            className={`hidden shrink-0 flex-col overflow-hidden border-border-divider transition-[width,opacity] duration-200 lg:flex ${
              hasDesktopDetailsPanel
                ? "lg:w-72 lg:border-r lg:opacity-100"
                : "pointer-events-none lg:w-0 lg:border-r-0 lg:opacity-0"
            }`}
          >
            <div className="flex w-72 min-w-72 flex-1 flex-col gap-3 overflow-y-auto p-3">
              {hasDesktopDetailsPanel && (
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
                  <div className="trip-map-marker-details">
                    {selectedMarker && renderMarkerDetails
                      ? renderMarkerDetails(selectedMarker)
                      : activeSuggestion && renderSuggestionDetails
                        ? renderSuggestionDetails(activeSuggestion)
                        : null}
                  </div>
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
                    ? `top-32 ${hasDesktopDetailsPanel ? "left-[18.75rem]" : "left-3"}`
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
            {suggestionMode && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg bg-surface/95 px-4 py-2 text-sm font-semibold text-on-surface shadow-card">
                {t("suggestionHelper.placeFlag")}
              </div>
            )}
            {!fullScreen && (
              <div className="absolute bottom-3 left-3 z-10 grid gap-1 rounded-lg bg-surface/95 px-3 py-2 text-xs text-on-surface shadow-card">
                {renderLegend()}
              </div>
            )}
            {fullScreen && onSuggestionModeToggle && (
              <button
                aria-pressed={suggestionMode}
                className={`absolute right-3 top-3 z-10 rounded-lg px-3 py-2 text-xs font-semibold shadow-card ${
                  suggestionMode
                    ? "bg-brand-surface text-on-brand"
                    : "bg-surface text-on-surface hover:bg-surface-muted"
                }`}
                onClick={onSuggestionModeToggle}
                type="button"
              >
                {suggestionMode
                  ? t("suggestionHelper.cancelPin")
                  : t("suggestionHelper.open")}
              </button>
            )}
            {markers.length === 0 && (
              <div
                className={`absolute inset-0 grid place-items-center bg-surface-muted/80 p-6 text-center text-sm text-muted ${
                  suggestionMode ? "pointer-events-none" : ""
                }`}
              >
                {t("tripMap.noLocations")}
              </div>
            )}
          </div>
          {suggestionPanel}
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
              setActiveSuggestion(null)
              setIsMobileOpen(false)
            }}
            openLabel={t("tripMap.close")}
            showOnDesktop
          />
        </div>
      </section>
      {(selectedMarker && renderMarkerDetails) || (activeSuggestion && renderSuggestionDetails) ? (
        <div className="pointer-events-none fixed inset-0 z-[60] p-3 lg:hidden">
          <div
            className={`trip-map-marker-details pointer-events-auto mx-auto flex max-h-[calc(100dvh-1.5rem)] max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-card${
              isMarkerDetailsClosing ? " trip-map-marker-details-closing" : ""
            }`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-divider p-3">
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
            <div className="min-h-0 overflow-y-auto p-3">
              {selectedMarker && renderMarkerDetails
                ? renderMarkerDetails(selectedMarker)
                : activeSuggestion && renderSuggestionDetails
                  ? renderSuggestionDetails(activeSuggestion)
                  : null}
              {renderGooglePlaceDetails()}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
