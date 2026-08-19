import { useTranslation } from "react-i18next"
import type { Activity, Meal, TripDetail } from "../../api"
import { ItemDetailsDisplay } from "../../components/ItemDetails"
import { TripItemPreference } from "../../components/TripItemPreference"
import { formatDate } from "../../lib/date-format"
import { formatActivityTime, getDayItemTitle } from "../../lib/activity-format"
import { shiftDate } from "../../lib/trip-dates"
import type { TripItemPreferenceValue, TripItemType } from "@turprep/models"
import type { TripMapMarker } from "./TripMap"

type ItemDetailVisibility = {
  showPrice: boolean
  showWebsite: boolean
}

type TripMapMarkerDetailsProps = {
  marker: TripMapMarker
  trip: TripDetail
  itemDetailVisibility: ItemDetailVisibility
  savingPreferenceKey: string | null
  userId: string
  onMapHousingAction: (action: { type: "edit" | "delete"; stayId: string }) => void
  onEditActivity: (activity: Activity) => void
  onRequestDeleteActivity: (activity: Activity) => void
  onEditMeal: (meal: Meal) => void
  onRequestDeleteMeal: (meal: Meal) => void
  onPreferenceChange: (
    itemType: TripItemType,
    itemId: string,
    value: TripItemPreferenceValue | null,
  ) => void
}

export function TripMapMarkerDetails({
  marker,
  trip,
  itemDetailVisibility,
  savingPreferenceKey,
  userId,
  onMapHousingAction,
  onEditActivity,
  onRequestDeleteActivity,
  onEditMeal,
  onRequestDeleteMeal,
  onPreferenceChange,
}: TripMapMarkerDetailsProps) {
  const { t } = useTranslation()

  if (marker.type === "housing") {
    const stay = trip.housingStays.find((currentStay) => currentStay.id === marker.id)

    if (!stay) {
      return null
    }

    return (
      <article className="rounded-xl bg-surface p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand">{stay.name}</p>
            <p className="mt-1 text-sm text-muted">
              {formatDate(stay.checkIn ?? trip.startDate)} –{" "}
              {formatDate(stay.checkOut ?? shiftDate(trip.endDate, 1))}
            </p>
            {stay.notes?.trim() && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{stay.notes}</p>
            )}
            <ItemDetailsDisplay
              details={stay}
              showPrice={itemDetailVisibility.showPrice}
              showWebsite={itemDetailVisibility.showWebsite}
            />
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
              onClick={() => onMapHousingAction({ type: "edit", stayId: stay.id })}
              type="button"
            >
              {t("common.edit")}
            </button>
            <button
              className="rounded-lg px-2 py-1 text-xs font-semibold text-error hover:bg-danger-surface"
              onClick={() => onMapHousingAction({ type: "delete", stayId: stay.id })}
              type="button"
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
        <TripItemPreference
          disabled={savingPreferenceKey === `housing:${stay.id}`}
          itemId={stay.id}
          itemType="housing"
          onChange={(value) => onPreferenceChange("housing", stay.id, value)}
          preferences={trip.preferences}
          userId={userId}
        />
      </article>
    )
  }

  const item =
    marker.type === "activity"
      ? trip.days
          .flatMap((day) => day.activities)
          .find((activity) => activity.id === marker.id)
      : trip.meals.find((meal) => meal.id === marker.id)

  if (!item) {
    return null
  }

  const itemType = marker.type

  return (
    <article className="rounded-xl bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand">
            {getDayItemTitle(item, t("tripDetails.untitledItem"))}
          </p>
          <p className="mt-1">
            {formatActivityTime(item, {
              allDay: t("tripDetails.allDay"),
              timeNotSet: t("tripDetails.timeNotSet"),
            })}
          </p>
          {itemType === "meal" && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent-text">
              {t("tripDetails.meal")}
            </p>
          )}
          {item.placeAddress && <p className="mt-1 text-sm text-muted">{item.placeAddress}</p>}
          {item.notes?.trim() && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.notes}</p>
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
        <div className="flex shrink-0 gap-1">
          <button
            className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted"
            onClick={() =>
              itemType === "activity"
                ? onEditActivity(item as Activity)
                : onEditMeal(item as Meal)
            }
            type="button"
          >
            {t("common.edit")}
          </button>
          <button
            className="rounded-lg px-2 py-1 text-xs font-semibold text-error hover:bg-danger-surface"
            onClick={() =>
              itemType === "activity"
                ? onRequestDeleteActivity(item as Activity)
                : onRequestDeleteMeal(item as Meal)
            }
            type="button"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
      <TripItemPreference
        disabled={savingPreferenceKey === `${itemType}:${item.id}`}
        itemId={item.id}
        itemType={itemType}
        onChange={(value) => onPreferenceChange(itemType, item.id, value)}
        preferences={trip.preferences}
        userId={userId}
      />
    </article>
  )
}
