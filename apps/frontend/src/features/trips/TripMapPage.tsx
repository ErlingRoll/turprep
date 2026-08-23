import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"
import {
  updateActivity,
  updateHousingStay,
  updateMeal,
  type GooglePlaceSuggestion,
  type TripDetail,
} from "../../api"
import { formatDate } from "../../lib/date-format"
import { formatActivityTime, getDayItemTitle } from "../../lib/activity-format"
import { shiftDate } from "../../lib/trip-dates"
import {
  replaceActivityInTrip,
  replaceHousingStayInTrip,
  replaceMealInTrip,
} from "./trip-state"
import { TripMap, type TripMapMarker } from "./TripMap"
import { TripSuggestionHelper, type SuggestionPin } from "./TripSuggestionHelper"
import { SuggestionMediaGallery } from "./SuggestionMediaGallery"
import {
  clearSuggestionSessionState,
  getSuggestionSessionState,
  updateSuggestionSessionState,
} from "./suggestion-session"

type TripMapPageProps = {
  accessToken: string
  fullScreen?: boolean
  onTripUpdated: (trip: TripDetail) => void
  trip: TripDetail
}

export function TripMapPage({
  accessToken,
  fullScreen = false,
  onTripUpdated,
  trip,
}: TripMapPageProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [storedSuggestionSession] = useState(() => getSuggestionSessionState(trip.id))
  const [showBackupItems, setShowBackupItems] = useState(false)
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(
    () => storedSuggestionSession?.isSuggestionOpen ?? false,
  )
  const [isDroppingSuggestionPin, setIsDroppingSuggestionPin] = useState(
    () => storedSuggestionSession?.isDroppingSuggestionPin ?? false,
  )
  const [suggestionPin, setSuggestionPin] = useState<SuggestionPin | null>(
    () => storedSuggestionSession?.pin ?? null,
  )
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>(
    () => storedSuggestionSession?.suggestions ?? [],
  )
  const [selectedSuggestionPlaceId, setSelectedSuggestionPlaceId] = useState<string | null>(
    () => storedSuggestionSession?.selectedSuggestionPlaceId ?? null,
  )

  useEffect(() => {
    updateSuggestionSessionState(trip.id, {
      isSuggestionOpen,
      isDroppingSuggestionPin,
      pin: suggestionPin,
      selectedSuggestionPlaceId,
      suggestions,
    })
  }, [
    isDroppingSuggestionPin,
    isSuggestionOpen,
    selectedSuggestionPlaceId,
    suggestionPin,
    suggestions,
    trip.id,
  ])
  const markers = useMemo<TripMapMarker[]>(
    () => {
      const activeMarkers: TripMapMarker[] = [
      ...trip.days.flatMap((day) =>
        day.activities.flatMap((activity) =>
          activity.latitude !== null && activity.longitude !== null
            ? [
                {
                  date: activity.tripDate ?? day.date,
                  id: activity.id,
                  latitude: activity.latitude,
                  longitude: activity.longitude,
                  title: getDayItemTitle(activity, t("tripDetails.untitledItem")),
                  type: "activity" as const,
                  googleMapsUrl: activity.googleMapsUrl,
                },
              ]
            : [],
        ),
      ),
      ...trip.meals.flatMap((meal) =>
        !meal.isBackup &&
        meal.tripDate &&
        meal.latitude !== null &&
        meal.longitude !== null
          ? [
              {
                date: meal.tripDate,
                id: meal.id,
                latitude: meal.latitude,
                longitude: meal.longitude,
                title: getDayItemTitle(meal, t("tripDetails.untitledItem")),
                type: "meal" as const,
                googleMapsUrl: meal.googleMapsUrl,
              },
            ]
          : [],
      ),
      ...trip.housingStays.flatMap((stay) =>
        !stay.isBackup &&
        stay.latitude !== null &&
        stay.longitude !== null
          ? [
              {
                date: stay.checkIn ?? trip.startDate,
                id: stay.id,
                latitude: stay.latitude,
                longitude: stay.longitude,
                title: stay.name,
                type: "housing" as const,
                googleMapsUrl: stay.googleMapsUrl,
              },
            ]
          : [],
      ),
      ]

      if (!showBackupItems) {
        return activeMarkers
      }

      return [
        ...activeMarkers,
        ...trip.backupActivities.flatMap((activity) =>
          activity.latitude !== null && activity.longitude !== null
            ? [
                {
                  date: activity.tripDate ?? trip.startDate,
                  id: activity.id,
                  latitude: activity.latitude,
                  longitude: activity.longitude,
                  title: getDayItemTitle(activity, t("tripDetails.untitledItem")),
                  type: "activity" as const,
                  googleMapsUrl: activity.googleMapsUrl,
                },
              ]
            : [],
        ),
        ...trip.meals.flatMap((meal) =>
          meal.isBackup &&
          meal.latitude !== null &&
          meal.longitude !== null
            ? [
                {
                  date: meal.tripDate ?? trip.startDate,
                  id: meal.id,
                  latitude: meal.latitude,
                  longitude: meal.longitude,
                  title: getDayItemTitle(meal, t("tripDetails.untitledItem")),
                  type: "meal" as const,
                  googleMapsUrl: meal.googleMapsUrl,
                },
              ]
            : [],
        ),
        ...trip.housingStays.flatMap((stay) =>
          stay.isBackup && stay.latitude !== null && stay.longitude !== null
            ? [
                {
                  date: stay.checkIn ?? trip.startDate,
                  id: stay.id,
                  latitude: stay.latitude,
                  longitude: stay.longitude,
                  title: stay.name,
                  type: "housing" as const,
                  googleMapsUrl: stay.googleMapsUrl,
                },
              ]
            : [],
        ),
      ]
    },
    [showBackupItems, t, trip],
  )
  const focusKey = searchParams.get("focus")
  const focusMarker =
    markers.find((marker) => `${marker.type}:${marker.id}` === focusKey) ?? null

  const handleSuggestionModeToggle = useCallback(() => {
    if (suggestionPin) {
      if (!isSuggestionOpen) {
        setIsSuggestionOpen(true)
        return
      }

      setIsDroppingSuggestionPin((current) => !current)
      return
    }

    setIsDroppingSuggestionPin((current) => !current)
  }, [isSuggestionOpen, suggestionPin])

  const handleSuggestionMapClick = useCallback((point: SuggestionPin) => {
    if (suggestionPin) {
      updateSuggestionSessionState(trip.id, {
        isSuggestionOpen: true,
        isDroppingSuggestionPin: false,
        pin: point,
        selectedSuggestionPlaceId: null,
        suggestions: [],
      })
    } else {
      clearSuggestionSessionState(trip.id)
    }
    setSuggestionPin(point)
    setSuggestions([])
    setSelectedSuggestionPlaceId(null)
    setIsDroppingSuggestionPin(false)
    setIsSuggestionOpen(true)
  }, [suggestionPin, trip.id])

  const handleSuggestionReset = useCallback(() => {
    clearSuggestionSessionState(trip.id)
    setSuggestionPin(null)
    setSuggestions([])
    setSelectedSuggestionPlaceId(null)
    setIsSuggestionOpen(false)
    setIsDroppingSuggestionPin(true)
  }, [trip.id])

  const handleSuggestionSelect = useCallback((suggestion: GooglePlaceSuggestion) => {
    setSelectedSuggestionPlaceId(suggestion.placeId)
    setIsSuggestionOpen(true)
  }, [])

  const handleMarkerClick = useCallback(() => {
    setSelectedSuggestionPlaceId(null)
  }, [])

  async function saveMarkerLocation(
    marker: TripMapMarker,
    latitude: number,
    longitude: number,
  ) {
    if (marker.type === "activity") {
      const savedActivity = await updateActivity(accessToken, trip.id, marker.id, {
        latitude,
        longitude,
      })
      onTripUpdated(replaceActivityInTrip(trip, savedActivity))
      return
    }

    if (marker.type === "meal") {
      const savedMeal = await updateMeal(accessToken, trip.id, marker.id, {
        latitude,
        longitude,
      })
      onTripUpdated(replaceMealInTrip(trip, savedMeal))
      return
    }

    const savedHousing = await updateHousingStay(accessToken, trip.id, marker.id, {
      latitude,
      longitude,
    })
    onTripUpdated(replaceHousingStayInTrip(trip, savedHousing))
  }

  function renderMarkerDetails(marker: TripMapMarker) {
    if (marker.type === "housing") {
      const stay = trip.housingStays.find((currentStay) => currentStay.id === marker.id)

      if (!stay) {
        return null
      }

      return (
        <article className="rounded-2xl bg-surface/95 p-4 shadow-card backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("tripMap.housing")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-brand">{stay.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatDate(stay.checkIn ?? trip.startDate)} –{" "}
            {formatDate(stay.checkOut ?? shiftDate(trip.endDate, 1))}
          </p>
          {stay.placeAddress && <p className="mt-2 text-sm text-muted">{stay.placeAddress}</p>}
          {stay.notes?.trim() && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{stay.notes}</p>
          )}
          {stay.website && (
            <a
              className="mt-2 block break-all text-sm font-semibold text-brand underline"
              href={stay.website}
              rel="noreferrer"
              target="_blank"
            >
              {t("itemDetails.website")}: {stay.website}
            </a>
          )}
          {stay.googleMapsUrl && (
            <a
              className="mt-2 block text-sm font-semibold text-brand underline"
              href={stay.googleMapsUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("tripDetails.openGoogleMaps")}
            </a>
          )}
        </article>
      )
    }

    const item =
      marker.type === "activity"
        ? [...trip.days.flatMap((day) => day.activities), ...trip.backupActivities].find(
            (activity) => activity.id === marker.id,
          )
        : trip.meals.find((meal) => meal.id === marker.id)

    if (!item) {
      return null
    }

    return (
      <div className="rounded-2xl bg-surface/95 p-4 shadow-card backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {marker.type === "activity" ? t("tripMap.activity") : t("tripMap.meal")}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-brand">
          {getDayItemTitle(item, t("tripDetails.untitledItem"))}
        </h2>
        <p className="mt-1 text-sm text-muted">{formatDate(marker.date)}</p>
        <p className="mt-2 text-sm text-on-surface">
          {formatActivityTime(item, {
            allDay: t("tripDetails.allDay"),
            timeNotSet: t("tripDetails.timeNotSet"),
          })}
        </p>
        {item.placeAddress && <p className="mt-2 text-sm text-muted">{item.placeAddress}</p>}
        {item.notes?.trim() && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.notes}</p>
        )}
        {item.website && (
          <a
            className="mt-2 block break-all text-sm font-semibold text-brand underline"
            href={item.website}
            rel="noreferrer"
            target="_blank"
          >
            {t("itemDetails.website")}: {item.website}
          </a>
        )}
        {item.googleMapsUrl && (
          <a
            className="mt-2 block text-sm font-semibold text-brand underline"
            href={item.googleMapsUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("tripDetails.openGoogleMaps")}
          </a>
        )}
      </div>
    )
  }

  function renderSuggestionDetails(suggestion: GooglePlaceSuggestion) {
    return (
      <article className="rounded-2xl bg-surface/95 p-4 shadow-card backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("suggestionHelper.suggestion")}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-brand">{suggestion.name}</h2>
        <SuggestionMediaGallery accessToken={accessToken} suggestion={suggestion} />
        <p className="mt-1 text-sm text-muted">{suggestion.address}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {suggestion.category && <span>{suggestion.category}</span>}
          <span>{Math.round(suggestion.distanceMeters)} m</span>
          {suggestion.rating !== null && (
            <span>
              ★ {suggestion.rating.toFixed(1)}
              {suggestion.userRatingCount !== null ? ` (${suggestion.userRatingCount})` : ""}
            </span>
          )}
        </div>
        <a
          className="mt-3 block text-sm font-semibold text-brand underline"
          href={suggestion.googleMapsUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("tripDetails.openGoogleMaps")}
        </a>
      </article>
    )
  }

  return (
    <section className={fullScreen ? "h-dvh" : "mt-4 grid gap-4"}>
      <TripMap
        focusMarker={focusMarker}
        fullScreen={fullScreen}
        fullScreenToolbar={
          fullScreen ? (
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
              <Link
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
                to={`/trips/${trip.id}`}
              >
                <span aria-hidden="true">←</span>
                {t("tripMap.backToPlan")}
              </Link>
              <span className="hidden h-5 w-px bg-border sm:block" />
              <span className="max-w-40 truncate px-2 sm:max-w-56">{trip.name}</span>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                <input
                  checked={showBackupItems}
                  onChange={(event) => setShowBackupItems(event.target.checked)}
                  type="checkbox"
                />
                {t("tripMap.showBackup")}
              </label>
            </div>
          ) : undefined
        }
        markers={markers}
        accessToken={accessToken}
        onMarkerClick={handleMarkerClick}
        onMarkerLocationSave={saveMarkerLocation}
        onMapClick={isDroppingSuggestionPin ? handleSuggestionMapClick : undefined}
        onSuggestionModeToggle={handleSuggestionModeToggle}
        onSuggestionMarkerClick={handleSuggestionSelect}
        renderMarkerDetails={renderMarkerDetails}
        renderSuggestionDetails={renderSuggestionDetails}
        suggestionMode={isDroppingSuggestionPin}
        suggestionMarkers={suggestions}
        selectedSuggestion={
          suggestions.find((suggestion) => suggestion.placeId === selectedSuggestionPlaceId) ?? null
        }
        suggestionPanel={
          isSuggestionOpen ? (
            <TripSuggestionHelper
              accessToken={accessToken}
              onReset={handleSuggestionReset}
              onSuggestionSelect={handleSuggestionSelect}
              onSuggestionsChange={setSuggestions}
              onTripUpdated={onTripUpdated}
              pin={suggestionPin}
              selectedSuggestionPlaceId={selectedSuggestionPlaceId}
              trip={trip}
            />
          ) : undefined
        }
        suggestionPin={suggestionPin}
      />
    </section>
  )
}
