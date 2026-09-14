import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createHousingStay,
  createMeal,
  type GooglePlaceSearchResult,
  type TripDetail,
} from "../../api"
import { useToast } from "../../components/ToastContext"
import { sortActivities } from "../../lib/activity-format"
import { formatDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import { shiftDate } from "../../lib/trip-dates"

type SearchResultItemType = "activity" | "meal" | "housing"
type SearchResultDestination = "plan" | "backup"

type TripMapSearchResultDetailsProps = {
  accessToken: string
  /** Called once the place is saved, so the caller can drop the temporary pin. */
  onAdded: () => void
  onTripUpdated: (trip: TripDetail) => void
  result: GooglePlaceSearchResult
  trip: TripDetail
}

const itemTypes: SearchResultItemType[] = ["activity", "meal", "housing"]
const destinations: SearchResultDestination[] = ["plan", "backup"]

/**
 * Details for a map search hit, plus the controls for adding it to the plan or
 * to the backup list. Reset per place by keying on the result.
 */
export function TripMapSearchResultDetails({
  accessToken,
  onAdded,
  onTripUpdated,
  result,
  trip,
}: TripMapSearchResultDetailsProps) {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const [itemType, setItemType] = useState<SearchResultItemType>("activity")
  const [destination, setDestination] = useState<SearchResultDestination>("plan")
  const [tripDate, setTripDate] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check-out is the morning after the last night, so it may fall one day
  // outside the trip range.
  const checkOutDates = [...trip.days.map((day) => day.date).slice(1), shiftDate(trip.endDate, 1)]
  const needsTripDate = destination === "plan" && itemType !== "housing"
  const needsStayDates = destination === "plan" && itemType === "housing"
  const canAdd =
    !isAdding &&
    (!needsTripDate || Boolean(tripDate)) &&
    (!needsStayDates || (Boolean(checkIn) && Boolean(checkOut) && checkOut > checkIn))

  const placeFields = {
    googleMapsUrl: result.googleMapsUrl,
    placeName: result.name,
    placeAddress: result.address,
    latitude: result.latitude,
    longitude: result.longitude,
    priceAmount: null,
    priceCurrency: null,
    website: null,
  }

  function confirmAdded() {
    addToast(t("tripMap.addedToTrip", { name: result.name }), "success")
    onAdded()
  }

  async function handleAdd() {
    if (!canAdd) {
      return
    }

    setIsAdding(true)
    setError(null)

    try {
      if (itemType === "housing") {
        const savedStay = await createHousingStay(accessToken, trip.id, {
          ...placeFields,
          name: result.name,
          checkIn: destination === "plan" ? checkIn : null,
          checkOut: destination === "plan" ? checkOut : null,
          isBackup: destination === "backup",
          notes: null,
        })
        onTripUpdated({ ...trip, housingStays: [...trip.housingStays, savedStay] })
        confirmAdded()
        return
      }

      const input = {
        ...placeFields,
        tripDate: destination === "plan" ? tripDate : null,
        isBackup: destination === "backup",
        title: result.name,
        startTime: null,
        endTime: null,
        allDay: true,
        notes: null,
      }

      if (itemType === "activity") {
        const savedActivity = await createActivity(accessToken, trip.id, input)
        onTripUpdated(
          destination === "backup"
            ? { ...trip, backupActivities: [...trip.backupActivities, savedActivity] }
            : {
                ...trip,
                days: trip.days.map((day) =>
                  day.date === tripDate
                    ? { ...day, activities: sortActivities([...day.activities, savedActivity]) }
                    : day,
                ),
              },
        )
      } else {
        const savedMeal = await createMeal(accessToken, trip.id, input)
        onTripUpdated({ ...trip, meals: [...trip.meals, savedMeal] })
      }

      confirmAdded()
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <article className="rounded-2xl bg-surface/95 p-4 shadow-card backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t("tripMap.searchResult")}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-brand">{result.name}</h2>
      <p className="mt-1 text-sm text-muted">{result.address}</p>

      <section className="mt-3 rounded-xl border border-border-soft bg-surface-soft p-3">
        <p className="text-sm font-semibold text-on-surface">{t("tripMap.addToTrip")}</p>

        <select
          aria-label={t("tripMap.addAs")}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-on-surface"
          onChange={(event) => {
            setItemType(event.target.value as SearchResultItemType)
            setError(null)
          }}
          value={itemType}
        >
          {itemTypes.map((nextItemType) => (
            <option key={nextItemType} value={nextItemType}>
              {t(`tripMap.${nextItemType}`)}
            </option>
          ))}
        </select>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {destinations.map((nextDestination) => (
            <button
              className={`min-w-0 truncate rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                destination === nextDestination
                  ? "border-brand bg-brand-surface text-on-brand"
                  : "border-border bg-surface text-on-surface hover:border-brand"
              }`}
              key={nextDestination}
              onClick={() => {
                setDestination(nextDestination)
                setError(null)
              }}
              type="button"
            >
              {t(`suggestionHelper.destinations.${nextDestination}`)}
            </button>
          ))}
        </div>

        {needsTripDate && (
          <select
            aria-label={t("suggestionHelper.chooseDay")}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-on-surface"
            onChange={(event) => setTripDate(event.target.value)}
            value={tripDate}
          >
            <option value="">{t("suggestionHelper.chooseDay")}</option>
            {trip.days.map((day) => (
              <option key={day.date} value={day.date}>
                {formatDate(day.date)}
                {day.title ? ` · ${day.title}` : ""}
              </option>
            ))}
          </select>
        )}

        {needsStayDates && (
          <div className="mt-2 grid gap-1.5">
            <select
              aria-label={t("tripMap.checkIn")}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-on-surface"
              onChange={(event) => setCheckIn(event.target.value)}
              value={checkIn}
            >
              <option value="">{t("tripMap.checkIn")}</option>
              {trip.days.map((day) => (
                <option key={day.date} value={day.date}>
                  {formatDate(day.date)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("tripMap.checkOut")}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-on-surface"
              onChange={(event) => setCheckOut(event.target.value)}
              value={checkOut}
            >
              <option value="">{t("tripMap.checkOut")}</option>
              {checkOutDates.map((date) => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          className="mt-2 w-full rounded-lg bg-brand-surface px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canAdd}
          onClick={() => void handleAdd()}
          type="button"
        >
          {isAdding ? t("common.saving") : t("suggestionHelper.confirmAdd")}
        </button>

        {error && (
          <p className="mt-2 text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </article>
  )
}
