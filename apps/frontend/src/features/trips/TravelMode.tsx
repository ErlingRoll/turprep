import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TripDetail } from "../../api"
import { ItemDetailsDisplay } from "../../components/ItemDetails"
import { MapLocateButton } from "../../components/MapLocateButton"
import { formatActivityTime, getDayItemTitle, sortActivities } from "../../lib/activity-format"
import { formatDate } from "../../lib/date-format"
import { TripMap, type TripMapMarker } from "./TripMap"
import { DayChevron, MobileDayPager } from "./MobileDayPager"

type TravelModeProps = {
  trip: TripDetail
  showDetails: boolean
}

function getTodayDate() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}

function getRelevantDayIndex(days: TripDetail["days"]) {
  const today = getTodayDate()
  const todayIndex = days.findIndex((day) => day.date === today)

  if (todayIndex >= 0) {
    return todayIndex
  }

  const nextDayIndex = days.findIndex((day) => day.date > today)
  return nextDayIndex >= 0 ? nextDayIndex : days.length - 1
}

export function TravelMode({ trip, showDetails }: TravelModeProps) {
  const { t } = useTranslation()
  const [selectedDate, setSelectedDate] = useState(
    () => trip.days[getRelevantDayIndex(trip.days)]?.date ?? "",
  )
  const [mapFocusRequest, setMapFocusRequest] = useState<{ itemKey: string } | null>(null)
  const [highlightedMapItemKey, setHighlightedMapItemKey] = useState<string | null>(null)
  const [mapFocusMarker, setMapFocusMarker] = useState<TripMapMarker | null>(null)

  useEffect(() => {
    setSelectedDate(trip.days[getRelevantDayIndex(trip.days)]?.date ?? "")
  }, [trip.id, trip.days])

  useEffect(() => {
    if (!mapFocusRequest) {
      return
    }

    setHighlightedMapItemKey(null)
    let highlightTimeout: number | null = null
    const frame = requestAnimationFrame(() => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-trip-item-key="${mapFocusRequest.itemKey}"]`),
      )
      const element = elements.find((candidate) => candidate.getClientRects().length > 0)

      if (!element) {
        return
      }

      const bounds = element.getBoundingClientRect()
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        element.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "center",
        })
      }
      setHighlightedMapItemKey(mapFocusRequest.itemKey)
      highlightTimeout = window.setTimeout(() => {
        setHighlightedMapItemKey(null)
      }, 4800)
    })

    return () => {
      cancelAnimationFrame(frame)
      if (highlightTimeout !== null) {
        window.clearTimeout(highlightTimeout)
      }
    }
  }, [mapFocusRequest])

  const selectedDayIndex = useMemo(() => {
    const selectedIndex = trip.days.findIndex((day) => day.date === selectedDate)
    return selectedIndex >= 0 ? selectedIndex : getRelevantDayIndex(trip.days)
  }, [selectedDate, trip.days])
  const selectedDay = trip.days[selectedDayIndex]
  const itemDetailVisibility = {
    showPrice: showDetails && trip.itemDetailVisibility.showPrice,
    showWebsite: showDetails && trip.itemDetailVisibility.showWebsite,
  }
  const today = getTodayDate()
  const isToday = selectedDay.date === today
  const housingForDay = useMemo(
    () =>
      trip.housingStays.filter(
        (stay) =>
          !stay.isBackup &&
          stay.checkIn !== null &&
          stay.checkOut !== null &&
          stay.checkIn <= selectedDay.date &&
          selectedDay.date < stay.checkOut,
      ),
    [selectedDay.date, trip.housingStays],
  )
  const mealsForDay = useMemo(
    () => trip.meals.filter((meal) => meal.tripDate === selectedDay.date),
    [selectedDay.date, trip.meals],
  )
  const mapMarkers = useMemo<TripMapMarker[]>(
    () => [
      ...selectedDay.activities.flatMap((activity) =>
        activity.latitude !== null && activity.longitude !== null
          ? [
              {
                id: activity.id,
                type: "activity" as const,
                title: getDayItemTitle(activity, t("tripDetails.untitledItem")),
                date: selectedDay.date,
                latitude: activity.latitude,
                longitude: activity.longitude,
              },
            ]
          : [],
      ),
      ...mealsForDay.flatMap((meal) =>
        meal.latitude !== null && meal.longitude !== null
          ? [
              {
                id: meal.id,
                type: "meal" as const,
                title: getDayItemTitle(meal, t("tripDetails.untitledItem")),
                date: selectedDay.date,
                latitude: meal.latitude,
                longitude: meal.longitude,
              },
            ]
          : [],
      ),
      ...housingForDay.flatMap((stay) =>
        stay.latitude !== null && stay.longitude !== null
          ? [
              {
                id: stay.id,
                type: "housing" as const,
                title: stay.placeName ?? stay.name,
                date: selectedDay.date,
                latitude: stay.latitude,
                longitude: stay.longitude,
              },
            ]
          : [],
      ),
    ],
    [housingForDay, mealsForDay, selectedDay.activities, selectedDay.date, t],
  )

  function moveDay(offset: number) {
    const nextDay = trip.days[selectedDayIndex + offset]

    if (nextDay) {
      setSelectedDate(nextDay.date)
    }
  }

  function handleMapMarkerClick(marker: TripMapMarker) {
    setMapFocusRequest({ itemKey: `${marker.type}:${marker.id}` })
  }

  function handleLocateItem(type: TripMapMarker["type"], id: string) {
    const marker = mapMarkers.find(
      (currentMarker) => currentMarker.type === type && currentMarker.id === id,
    )

    if (marker) {
      setMapFocusMarker(marker)
    }
  }

  function renderMapMarkerDetails(marker: TripMapMarker) {
    if (marker.type === "housing") {
      const stay = housingForDay.find((currentStay) => currentStay.id === marker.id)

      return stay ? (
        <article className="rounded-xl bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t("travelMode.housing")}
          </p>
          <p className="mt-1 break-words font-semibold text-brand">{stay.name}</p>
          <p className="mt-1 text-sm text-muted">
            {formatDate(stay.checkIn ?? trip.startDate)} –{" "}
            {formatDate(stay.checkOut ?? trip.endDate)}
          </p>
          {stay.notes?.trim() && (
            <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted">{stay.notes}</p>
          )}
          <ItemDetailsDisplay
            details={stay}
            showPrice={itemDetailVisibility.showPrice}
            showWebsite={itemDetailVisibility.showWebsite}
          />
          {stay.googleMapsUrl && (
            <a
              className="mt-2 inline-block text-sm font-semibold text-brand underline"
              href={stay.googleMapsUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("tripDetails.openGoogleMaps")}
            </a>
          )}
        </article>
      ) : null
    }

    const item =
      marker.type === "activity"
        ? selectedDay.activities.find((activity) => activity.id === marker.id)
        : mealsForDay.find((meal) => meal.id === marker.id)

    if (!item) {
      return null
    }

    return (
      <article className="rounded-xl bg-surface p-3">
        <div className="flex items-start gap-3">
          <div
            className={`grid min-w-16 place-items-center rounded-xl px-2 py-2 text-sm font-semibold ${
              marker.type === "activity"
                ? "bg-brand-surface text-on-brand"
                : "bg-accent text-on-accent"
            }`}
          >
            {formatActivityTime(item, {
              allDay: t("tripDetails.allDay"),
              timeNotSet: t("tripDetails.timeNotSet"),
            })}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              {marker.type === "activity" ? t("tripDetails.activity") : t("travelMode.meal")}
            </p>
            <p className="mt-1 break-words font-semibold text-brand">
              {getDayItemTitle(item, t("tripDetails.untitledItem"))}
            </p>
            {item.placeAddress && (
              <p className="mt-1 break-words text-sm text-muted">{item.placeAddress}</p>
            )}
            {item.notes?.trim() && (
              <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted">
                {item.notes}
              </p>
            )}
            <ItemDetailsDisplay
              details={item}
              showPrice={itemDetailVisibility.showPrice}
              showWebsite={itemDetailVisibility.showWebsite}
            />
            {item.googleMapsUrl && (
              <a
                className="mt-2 inline-block text-sm font-semibold text-brand underline"
                href={item.googleMapsUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("tripDetails.openGoogleMaps")}
              </a>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <section className="mt-6 pb-24 lg:pb-0">
      <div className="hidden min-w-0 rounded-2xl border border-border-soft bg-surface-soft p-5 lg:block">
        <div className="mt-4 hidden items-center justify-between gap-3 lg:flex">
          <button
            aria-label={t("travelMode.previousDay")}
            className="grid size-11 place-items-center rounded-xl text-2xl text-on-surface transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
            disabled={selectedDayIndex === 0}
            onClick={() => moveDay(-1)}
            type="button"
          >
            <DayChevron direction="previous" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-text">
              {isToday
                ? t("travelMode.today")
                : t("travelMode.day", { day: selectedDay.dayNumber })}
            </p>
            <h2 className="mt-1 flex flex-wrap items-baseline justify-center gap-x-2 text-xl font-semibold text-brand">
              <span>{formatDate(selectedDay.date)}</span>
              {selectedDay.title?.trim() && (
                <span className="break-words font-normal text-muted">{selectedDay.title}</span>
              )}
            </h2>
          </div>
          <button
            aria-label={t("travelMode.nextDay")}
            className="grid size-11 place-items-center rounded-xl text-2xl text-on-surface transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30"
            disabled={selectedDayIndex === trip.days.length - 1}
            onClick={() => moveDay(1)}
            type="button"
          >
            <DayChevron direction="next" />
          </button>
        </div>
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)] lg:items-start lg:gap-5">
        <MobileDayPager days={trip.days} onSelectDate={setSelectedDate} selectedDate={selectedDate}>
          <div className="min-w-0">
            {(trip.notes?.trim() || selectedDay.notes?.trim()) && (
              <div className="grid gap-3">
                {trip.notes?.trim() && (
                  <div className="rounded-2xl border border-gold bg-warning-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-text">
                      {t("travelMode.tripNote")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-warning-body">
                      {trip.notes}
                    </p>
                  </div>
                )}
                {selectedDay.notes?.trim() && (
                  <div className="rounded-2xl border border-border-soft bg-surface-soft p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-success">
                      {t("travelMode.dayNote")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-success-body">
                      {selectedDay.notes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(housingForDay.length > 0 || mealsForDay.length > 0) && (
              <div className="mt-4 grid gap-3">
                {housingForDay.map((stay) => (
                  <article
                    className={`min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4 ${
                      highlightedMapItemKey === `housing:${stay.id}` ? "trip-map-card-focus" : ""
                    }`}
                    data-trip-item-key={`housing:${stay.id}`}
                    key={stay.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                          {t("travelMode.housing")}
                        </p>
                        <h3 className="mt-1 break-words font-semibold text-brand">{stay.name}</h3>
                      </div>
                      {stay.latitude !== null && stay.longitude !== null && (
                        <MapLocateButton
                          label={t("tripMap.locate")}
                          onClick={() => handleLocateItem("housing", stay.id)}
                        />
                      )}
                    </div>
                    {stay.notes?.trim() && (
                      <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted">
                        {stay.notes}
                      </p>
                    )}
                    <ItemDetailsDisplay
                      details={stay}
                      showPrice={itemDetailVisibility.showPrice}
                      showWebsite={itemDetailVisibility.showWebsite}
                    />
                  </article>
                ))}
                {mealsForDay.map((meal) => (
                  <article
                    className={`min-w-0 rounded-2xl border border-border bg-surface p-4 ${
                      highlightedMapItemKey === `meal:${meal.id}` ? "trip-map-card-focus" : ""
                    }`}
                    data-trip-item-key={`meal:${meal.id}`}
                    key={meal.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="grid min-w-16 place-items-center rounded-xl bg-accent px-2 py-2 text-sm font-semibold text-on-accent">
                          {formatActivityTime(meal, {
                            allDay: t("tripDetails.allDay"),
                            timeNotSet: t("tripDetails.timeNotSet"),
                          })}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                            {t("travelMode.meal")}
                          </p>
                          <h3 className="mt-1 break-words font-semibold text-brand">
                            {getDayItemTitle(meal, t("tripDetails.untitledItem"))}
                          </h3>
                          {meal.notes?.trim() && (
                            <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted">
                              {meal.notes}
                            </p>
                          )}
                          <ItemDetailsDisplay
                            details={meal}
                            showPrice={itemDetailVisibility.showPrice}
                            showWebsite={itemDetailVisibility.showWebsite}
                          />
                        </div>
                      </div>
                      {meal.latitude !== null && meal.longitude !== null && (
                        <MapLocateButton
                          label={t("tripMap.locate")}
                          onClick={() => handleLocateItem("meal", meal.id)}
                        />
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {sortActivities(selectedDay.activities).length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-dashed p-6 text-sm text-muted">
                  {t("travelMode.noActivities")}
                </p>
              ) : (
                sortActivities(selectedDay.activities).map((activity) => (
                  <article
                    className={`min-w-0 rounded-2xl border border-border-card bg-surface p-4 ${
                      highlightedMapItemKey === `activity:${activity.id}`
                        ? "trip-map-card-focus"
                        : ""
                    }`}
                    data-trip-item-key={`activity:${activity.id}`}
                    key={activity.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="grid min-w-16 place-items-center rounded-xl bg-brand-surface px-2 py-2 text-sm font-semibold text-on-brand">
                          {formatActivityTime(activity, {
                            allDay: t("tripDetails.allDay"),
                            timeNotSet: t("tripDetails.timeNotSet"),
                          })}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-semibold text-brand">
                            {getDayItemTitle(activity, t("tripDetails.untitledItem"))}
                          </h3>
                          {activity.placeAddress && (
                            <p className="mt-1 break-words text-sm text-muted">
                              {activity.placeAddress}
                            </p>
                          )}
                          {activity.notes?.trim() && (
                            <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted">
                              {activity.notes}
                            </p>
                          )}
                          <ItemDetailsDisplay
                            details={activity}
                            showPrice={itemDetailVisibility.showPrice}
                            showWebsite={itemDetailVisibility.showWebsite}
                          />
                          {activity.googleMapsUrl && (
                            <a
                              className="mt-3 inline-flex rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-soft"
                              href={activity.googleMapsUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {t("tripDetails.openGoogleMaps")}
                            </a>
                          )}
                        </div>
                      </div>
                      {activity.latitude !== null && activity.longitude !== null && (
                        <MapLocateButton
                          label={t("tripMap.locate")}
                          onClick={() => handleLocateItem("activity", activity.id)}
                        />
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </MobileDayPager>
        <TripMap
          focusMarker={mapFocusMarker}
          markers={mapMarkers}
          onMarkerClick={handleMapMarkerClick}
          onFocusMarkerHandled={() => setMapFocusMarker(null)}
          renderMarkerDetails={renderMapMarkerDetails}
        />
      </div>
    </section>
  )
}
