import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"
import {
  updateActivity,
  updateHousingStay,
  updateMeal,
  type TripDetail,
} from "../../api"
import { formatDate } from "../../lib/date-format"
import { getDayItemTitle } from "../../lib/activity-format"
import {
  replaceActivityInTrip,
  replaceHousingStayInTrip,
  replaceMealInTrip,
} from "./trip-state"
import { TripMap, type TripMapMarker } from "./TripMap"

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
  const [showBackupItems, setShowBackupItems] = useState(false)
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
    return (
      <div className="rounded-2xl bg-surface/95 p-4 shadow-card backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {marker.type === "activity"
            ? t("tripMap.activity")
            : marker.type === "meal"
              ? t("tripMap.meal")
              : t("tripMap.housing")}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-brand">{marker.title}</h2>
        <p className="mt-1 text-sm text-muted">{formatDate(marker.date)}</p>
      </div>
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
        onMarkerLocationSave={saveMarkerLocation}
        renderMarkerDetails={renderMarkerDetails}
      />
    </section>
  )
}
