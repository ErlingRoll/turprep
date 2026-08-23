import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createMeal,
  deleteActivity,
  deleteMeal,
  getTrip,
  reorderDayItems,
  setTripItemPreference,
  updateTripDay,
  updateActivity,
  updateHousingStay,
  updateMeal,
  type Activity,
  type HousingStay,
  type Meal,
  type ReorderDayItemInput,
  type TripDetail,
} from "../../api"
import { getErrorMessage, isGoogleMapsError } from "../../lib/errors"
import {
  getDayItemTime,
  sortDayItems,
  sortActivities,
  getDayItemTitle,
  type DayItem,
} from "../../lib/activity-format"
import { LoadingCover } from "../../components/LoadingCover"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { getDefaultCurrency } from "../../lib/currency"
import { TripAuxiliaryDetails } from "./TripAuxiliaryDetails"
import { replaceActivityInTrip, replaceHousingStayInTrip, replaceMealInTrip } from "./trip-state"
import { TripSettings } from "./TripSettings"
import { DayItemForm } from "./DayItemForm"
import { DayItemList } from "./DayItemList"
import { MoveDayItemForm } from "./MoveDayItemForm"
import { TripDayCard } from "./TripDayCard"
import { TripDayNavigator } from "./TripDayNavigator"
import { TripDetailsHeader } from "./TripDetailsHeader"
import { TripMap, type TripMapMarker } from "./TripMap"
import { TripMapMarkerDetails } from "./TripMapMarkerDetails"
import { MobileDayPager } from "./MobileDayPager"
import { useTripRealtime } from "./useTripRealtime"
import { type ItemDetailValues } from "../../components/ItemDetails"
import type { TripDaySelection } from "./useTripDaySelection"
import type { DayItemRecord, DropTarget, MovingItem, PlannerTab } from "./planner-types"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import type { TripItemPreferenceValue, TripItemType } from "@turprep/models"

type TripDetailsProps = {
  accessToken: string
  trip: TripDetail | null
  isLoading: boolean
  error: string | null
  onTripUpdated: (trip: TripDetail) => void
  onTripDeleted: (trip: TripDetail) => Promise<void>
  userId: string
  daySelection: TripDaySelection
  showDetails: boolean
}

type PendingDeletion = { item: Activity; type: "activity" } | { item: Meal; type: "meal" }
type MapHousingAction = { type: "edit" | "delete"; stayId: string }
type MapFocusRequest = { itemKey: string }

function shiftTime(value: string, hours: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return ""
  }

  const totalMinutes = (Number(match[1]) * 60 + Number(match[2]) + hours * 60 + 24 * 60) % (24 * 60)

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`
}

export function TripDetails({
  accessToken,
  trip,
  isLoading,
  error,
  onTripUpdated,
  onTripDeleted,
  userId,
  daySelection,
  showDetails,
}: TripDetailsProps) {
  const { t } = useTranslation()
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [title, setTitle] = useState("")
  const [googleMapsUrl, setGoogleMapsUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [editingItemType, setEditingItemType] = useState<DayItemRecord["itemType"] | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const [editingDayDate, setEditingDayDate] = useState<string | null>(null)
  const [dayTitle, setDayTitle] = useState("")
  const [dayNotes, setDayNotes] = useState("")
  const [isSavingDayDetails, setIsSavingDayDetails] = useState(false)
  const [plannerTab, setPlannerTab] = useState<PlannerTab>("all")
  const [showMobileHousing, setShowMobileHousing] = useState(false)
  const [mapHousingAction, setMapHousingAction] = useState<MapHousingAction | null>(null)
  const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest | null>(null)
  const [highlightedMapItemKey, setHighlightedMapItemKey] = useState<string | null>(null)
  const [mapFocusMarker, setMapFocusMarker] = useState<TripMapMarker | null>(null)
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<DayItemRecord | null>(null)
  const [movingItem, setMovingItem] = useState<MovingItem | null>(null)
  const [moveTargetDate, setMoveTargetDate] = useState("")
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const reorderQueueRef = useRef(Promise.resolve())
  const pendingReorderCountRef = useRef(0)
  const reorderGenerationRef = useRef(0)
  const { selectedDayDate, selectedDayDates, onSelectAll, onSelectDay, onToggleDay } = daySelection
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
  const mapMarkers = useMemo<TripMapMarker[]>(() => {
    if (!trip) {
      return []
    }

    const selectedDay = trip.days.find((day) => day.date === selectedDayDate) ?? trip.days[0]
    const mapDates = new Set(
      selectedDayDates.length > 0 ? selectedDayDates : selectedDay ? [selectedDay.date] : [],
    )

    return [
      ...trip.days.flatMap((day) =>
        mapDates.has(day.date)
          ? day.activities.flatMap((activity) =>
              activity.latitude !== null && activity.longitude !== null
                ? [
                    {
                      id: activity.id,
                      type: "activity" as const,
                      title: activity.title ?? activity.placeName ?? t("tripDetails.untitledItem"),
                      date: day.date,
                      latitude: activity.latitude,
                      longitude: activity.longitude,
                      googleMapsUrl: activity.googleMapsUrl,
                    },
                  ]
                : [],
            )
          : [],
      ),
      ...trip.meals.flatMap((meal) =>
        !meal.isBackup &&
        meal.tripDate !== null &&
        mapDates.has(meal.tripDate) &&
        meal.latitude !== null &&
        meal.longitude !== null
          ? [
              {
                id: meal.id,
                type: "meal" as const,
                title: meal.title ?? meal.placeName ?? t("tripDetails.untitledItem"),
                date: meal.tripDate,
                latitude: meal.latitude,
                longitude: meal.longitude,
                googleMapsUrl: meal.googleMapsUrl,
              },
            ]
          : [],
      ),
      ...trip.housingStays.flatMap((stay) => {
        const matchingDate = [...mapDates].find(
          (date) =>
            stay.checkIn !== null &&
            stay.checkOut !== null &&
            stay.checkIn <= date &&
            date < stay.checkOut,
        )

        return !stay.isBackup && matchingDate && stay.latitude !== null && stay.longitude !== null
          ? [
              {
                id: stay.id,
                type: "housing" as const,
                title: stay.placeName ?? stay.name,
                date: matchingDate,
                latitude: stay.latitude,
                longitude: stay.longitude,
                googleMapsUrl: stay.googleMapsUrl,
              },
            ]
          : []
      }),
    ]
  }, [selectedDayDate, selectedDayDates, t, trip])

  useTripRealtime({
    accessToken,
    isPaused: () => pendingReorderCountRef.current > 0,
    onError: setActivityError,
    onTripUpdated,
    tripId: trip?.id,
  })

  if (isLoading) {
    return <LoadingCover message={t("common.loadingTrip")} />
  }

  if (error) {
    return <p className="mt-6 text-sm text-error">{error}</p>
  }

  if (!trip) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-border-dashed p-6 text-sm text-muted">
        {t("tripDetails.selectTrip")}
      </p>
    )
  }

  const currentTrip = trip
  const currencies =
    currentTrip.acceptedCurrencies.length > 0
      ? currentTrip.acceptedCurrencies
      : [getDefaultCurrency()]
  const normalizedGoogleMapsUrl = googleMapsUrl.trim()
  const googleMapsUrlIsInvalid =
    normalizedGoogleMapsUrl.length > 0 && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)
  const selectedDay =
    currentTrip.days.find((day) => day.date === selectedDayDate) ?? currentTrip.days[0]
  const mobileSelectedDate = selectedDay?.date ?? selectedDayDate
  const itemDetailVisibility = {
    showPrice: showDetails && currentTrip.itemDetailVisibility.showPrice,
    showWebsite: showDetails && currentTrip.itemDetailVisibility.showWebsite,
  }

  function handleMapMarkerClick(marker: TripMapMarker) {
    const itemKey = `${marker.type}:${marker.id}`
    setShowMobileHousing(false)
    onSelectDay(marker.date, false)
    setPlannerTab(
      marker.type === "activity" ? "activities" : marker.type === "meal" ? "meals" : "all",
    )
    setMapFocusRequest({
      itemKey,
    })
  }

  function handleLocateItem(record: DayItemRecord) {
    const { item } = record

    if (item.latitude === null || item.longitude === null) {
      return
    }

    setMapFocusMarker({
      date: item.tripDate ?? selectedDay.date,
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      title: getDayItemTitle(item, t("tripDetails.untitledItem")),
      type: record.itemType,
    })
  }

  function handleLocateHousing(stay: HousingStay) {
    if (stay.latitude === null || stay.longitude === null) {
      return
    }

    setMapFocusMarker({
      date: stay.checkIn ?? currentTrip.startDate,
      id: stay.id,
      latitude: stay.latitude,
      longitude: stay.longitude,
      title: stay.placeName ?? stay.name,
      type: "housing",
    })
  }

  async function handleSaveMarkerLocation(
    marker: TripMapMarker,
    latitude: number,
    longitude: number,
  ) {
    setActivityError(null)

    try {
      if (marker.type === "housing") {
        const stay = currentTrip.housingStays.find((currentStay) => currentStay.id === marker.id)
        if (!stay) {
          throw new Error(t("errors.itemNotFound"))
        }

        const savedStay = await updateHousingStay(accessToken, currentTrip.id, stay.id, {
          latitude,
          longitude,
        })
        onTripUpdated(replaceHousingStayInTrip(currentTrip, savedStay))
        return
      }

      if (marker.type === "meal") {
        const meal = currentTrip.meals.find((currentMeal) => currentMeal.id === marker.id)
        if (!meal) {
          throw new Error(t("errors.itemNotFound"))
        }

        const savedMeal = await updateMeal(accessToken, currentTrip.id, meal.id, {
          latitude,
          longitude,
        })
        onTripUpdated(replaceMealInTrip(currentTrip, savedMeal))
        return
      }

      const day = currentTrip.days.find((currentDay) =>
        currentDay.activities.some((activity) => activity.id === marker.id),
      )
      const activity = day?.activities.find((currentActivity) => currentActivity.id === marker.id)
      if (!activity || !day) {
        throw new Error(t("errors.itemNotFound"))
      }

      const savedActivity = await updateActivity(accessToken, currentTrip.id, activity.id, {
        latitude,
        longitude,
      })
      onTripUpdated(replaceActivityInTrip(currentTrip, savedActivity))
    } catch (reason: unknown) {
      const message = getErrorMessage(reason)
      setActivityError(message)
      throw reason
    }
  }

  async function handleSaveDayItemDetails(record: DayItemRecord, details: ItemDetailValues) {
    if (record.itemType === "meal") {
      const savedMeal = await updateMeal(accessToken, currentTrip.id, record.item.id, details)
      onTripUpdated(replaceMealInTrip(currentTrip, savedMeal))
      return
    }

    const day = currentTrip.days.find((currentDay) =>
      currentDay.activities.some((activity) => activity.id === record.item.id),
    )
    if (!day) {
      throw new Error(t("errors.activityNotFound"))
    }

    const savedActivity = await updateActivity(accessToken, currentTrip.id, record.item.id, details)
    onTripUpdated(replaceActivityInTrip(currentTrip, savedActivity))
  }

  async function handleSaveHousingDetails(stay: HousingStay, details: ItemDetailValues) {
    const savedStay = await updateHousingStay(accessToken, currentTrip.id, stay.id, details)
    onTripUpdated(replaceHousingStayInTrip(currentTrip, savedStay))
  }

  function resetActivityForm() {
    setTitle("")
    setGoogleMapsUrl("")
    setNotes("")
    setStartTime("")
    setEndTime("")
    setAllDay(true)
    setEditingItemType(null)
    setEditingItemId(null)
    setActivityError(null)
    setGoogleMapsError(null)
    setMovingItem(null)
    setMoveTargetDate("")
  }

  function toggleActivityForm(date: string) {
    setOpenDay((currentDate) => {
      const nextDate = currentDate === date ? null : date
      resetActivityForm()
      if (nextDate !== null) {
        setEditingItemType(plannerTab === "meals" ? "meal" : "activity")
      }
      return nextDate
    })
    setActivityError(null)
  }

  function editActivity(activity: Activity) {
    setMovingItem(null)
    setOpenDay(activity.tripDate)
    setEditingItemType("activity")
    setEditingItemId(activity.id)
    setTitle(activity.title ?? "")
    setGoogleMapsUrl(activity.googleMapsUrl ?? "")
    setNotes(activity.notes ?? "")
    setStartTime(activity.startTime ?? "")
    setEndTime(activity.endTime ?? "")
    setAllDay(activity.allDay)
    setActivityError(null)
  }

  function editMeal(meal: Meal) {
    setMovingItem(null)
    setOpenDay(meal.tripDate)
    setEditingItemType("meal")
    setEditingItemId(meal.id)
    setTitle(meal.title ?? "")
    setGoogleMapsUrl(meal.googleMapsUrl ?? "")
    setNotes(meal.notes ?? "")
    setStartTime(meal.startTime ?? "")
    setEndTime(meal.endTime ?? "")
    setAllDay(meal.allDay)
    setActivityError(null)
  }

  function handleStartTimeChange(nextStartTime: string) {
    setStartTime(nextStartTime)

    if (nextStartTime && !endTime) {
      setEndTime(shiftTime(nextStartTime, 2))
    }
  }

  function handleEndTimeChange(nextEndTime: string) {
    setEndTime(nextEndTime)

    if (nextEndTime && !startTime) {
      setStartTime(shiftTime(nextEndTime, -2))
    }
  }

  function getDropIndex(event: DragEvent<HTMLDivElement>, itemIndex: number) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY >= bounds.top + bounds.height / 2 ? itemIndex + 1 : itemIndex
  }

  function getDayItems(day: TripDetail["days"][number], meals = currentTrip.meals) {
    return sortDayItems([
      ...day.activities,
      ...meals.filter((meal) => !meal.isBackup && meal.tripDate === day.date),
    ])
  }

  function getDayItemRecord(item: DayItem, meals = currentTrip.meals): DayItemRecord {
    const meal = meals.find((currentMeal) => currentMeal.id === item.id)

    return meal
      ? { itemType: "meal", item: meal }
      : { itemType: "activity", item: item as Activity }
  }

  async function moveActivityToBackup(activity: Activity) {
    setActivityError(null)
    try {
      const saved = await updateActivity(accessToken, currentTrip.id, activity.id, {
        isBackup: true,
      })
      onTripUpdated({
        ...currentTrip,
        backupActivities: [...currentTrip.backupActivities, saved],
        days: currentTrip.days.map((day) => ({
          ...day,
          activities: day.activities.filter(
            (currentActivity) => currentActivity.id !== activity.id,
          ),
        })),
      })
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    }
  }

  async function moveMealToBackup(meal: Meal) {
    setActivityError(null)
    try {
      const saved = await updateMeal(accessToken, currentTrip.id, meal.id, {
        isBackup: true,
      })
      onTripUpdated(replaceMealInTrip(currentTrip, saved))
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    }
  }

  async function moveHousingToBackup(stay: HousingStay) {
    setActivityError(null)
    try {
      const saved = await updateHousingStay(accessToken, currentTrip.id, stay.id, {
        isBackup: true,
      })
      onTripUpdated(replaceHousingStayInTrip(currentTrip, saved))
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    }
  }

  function buildOptimisticTrip(trip: TripDetail, affectedDays: Map<string, DayItem[]>) {
    const normalizedItemsByDate = new Map(
      trip.days.map((day) => [
        day.date,
        normalizeTimedDayItems(affectedDays.get(day.date) ?? getDayItems(day, trip.meals)),
      ]),
    )

    return {
      ...trip,
      days: trip.days.map((day) => {
        const normalizedItems = normalizedItemsByDate.get(day.date) ?? []

        return {
          ...day,
          activities: normalizedItems
            .filter(
              (item): item is Activity =>
                getDayItemRecord(item, trip.meals).itemType === "activity",
            )
            .map((activity) => ({
              ...activity,
              tripDate: day.date,
              sortOrder: normalizedItems.findIndex((currentItem) => currentItem.id === activity.id),
            })),
        }
      }),
      meals: trip.meals.map((meal) => {
        const normalizedEntry = Array.from(normalizedItemsByDate.entries()).find(([, items]) =>
          items.some((item) => item.id === meal.id),
        )

        if (!normalizedEntry) {
          return meal
        }

        const [dayDate, normalizedItems] = normalizedEntry
        return {
          ...meal,
          tripDate: dayDate,
          sortOrder: normalizedItems.findIndex((item) => item.id === meal.id),
        }
      }),
    }
  }

  function normalizeTimedDayItems(items: DayItem[]) {
    const timedItems = items
      .filter((item) => getDayItemTime(item) !== null)
      .sort((left, right) =>
        (getDayItemTime(left) ?? "").localeCompare(getDayItemTime(right) ?? ""),
      )
    let timedItemIndex = 0

    return items.map((item) => {
      if (getDayItemTime(item) === null) {
        return item
      }

      const normalizedItem = timedItems[timedItemIndex]
      timedItemIndex += 1
      return normalizedItem
    })
  }

  function getReorderInput(trip: TripDetail): ReorderDayItemInput[] {
    return trip.days.flatMap((day) =>
      getDayItems(day, trip.meals).map((item, sortOrder) => ({
        itemType: getDayItemRecord(item, trip.meals).itemType,
        itemId: item.id,
        tripDate: day.date,
        sortOrder,
      })),
    )
  }

  function insertDayItemByTime(items: DayItem[], item: DayItem, treatAsNewItem = false) {
    const currentIndex = items.findIndex((currentItem) => currentItem.id === item.id)
    const itemTime = getDayItemTime(item)

    if (itemTime === null && currentIndex >= 0 && !treatAsNewItem) {
      return items.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
    }

    const itemsWithoutItem = items.filter((currentItem) => currentItem.id !== item.id)

    if (itemTime === null) {
      return [item, ...itemsWithoutItem]
    }

    if (currentIndex >= 0) {
      const timedItems = items.filter((currentItem) => getDayItemTime(currentItem) !== null)
      const timedItemsWithoutItem = timedItems.filter((currentItem) => currentItem.id !== item.id)
      const firstLaterTimedIndex = timedItemsWithoutItem.findIndex((currentItem) => {
        const candidateTime = getDayItemTime(currentItem)
        return candidateTime !== null && candidateTime > itemTime
      })
      const insertionIndex =
        firstLaterTimedIndex >= 0 ? firstLaterTimedIndex : timedItemsWithoutItem.length
      const reorderedTimedItems = [
        ...timedItemsWithoutItem.slice(0, insertionIndex),
        item,
        ...timedItemsWithoutItem.slice(insertionIndex),
      ]
      let timedItemIndex = 0

      return items.map((currentItem) => {
        if (getDayItemTime(currentItem) === null) {
          return currentItem
        }

        const reorderedItem = reorderedTimedItems[timedItemIndex]
        timedItemIndex += 1
        return reorderedItem
      })
    }

    const firstLaterItemIndex = itemsWithoutItem.findIndex((currentItem) => {
      const candidateTime = getDayItemTime(currentItem)
      return candidateTime !== null && candidateTime > itemTime
    })
    const insertionIndex = firstLaterItemIndex >= 0 ? firstLaterItemIndex : itemsWithoutItem.length

    return [
      ...itemsWithoutItem.slice(0, insertionIndex),
      item,
      ...itemsWithoutItem.slice(insertionIndex),
    ]
  }

  function startMovingItem(record: DayItemRecord) {
    setMovingItem(record)
    setMoveTargetDate(record.item.tripDate ?? "")
    setEditingItemId(null)
    setEditingItemType(null)
    setActivityError(null)
  }

  function cancelMovingItem() {
    setMovingItem(null)
    setMoveTargetDate("")
  }

  function handleMoveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!movingItem || !moveTargetDate || movingItem.item.tripDate === moveTargetDate) {
      cancelMovingItem()
      return
    }

    const sourceDay = currentTrip.days.find((day) => day.date === movingItem.item.tripDate)
    const targetDay = currentTrip.days.find((day) => day.date === moveTargetDate)

    if (!sourceDay || !targetDay) {
      setActivityError(t("errors.activityOutsideTrip"))
      return
    }

    const sourceItems = getDayItems(sourceDay)
    const nextTargetItems = insertDayItemByTime(getDayItems(targetDay), movingItem.item, true)
    const affectedDays = new Map<string, DayItem[]>([
      [sourceDay.date, sourceItems.filter((item) => item.id !== movingItem.item.id)],
      [targetDay.date, nextTargetItems],
    ])
    const optimisticTrip = buildOptimisticTrip(currentTrip, affectedDays)

    setActivityError(null)
    setMovingItem(null)
    setMoveTargetDate("")
    onTripUpdated(optimisticTrip)
    queueDayItemReorder(optimisticTrip, getReorderInput(optimisticTrip))
  }

  function handleDayItemDragStart(event: DragEvent<HTMLDivElement>, record: DayItemRecord) {
    if (window.innerWidth < 1024) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", `${record.itemType}:${record.item.id}`)
    setDraggedItem(record)
  }

  function handleDayItemDragOver(
    event: DragEvent<HTMLDivElement>,
    dayDate: string,
    itemIndex: number,
  ) {
    if (!draggedItem) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const nextDropTarget = {
      dayDate,
      index: getDropIndex(event, itemIndex),
    }
    setDropTarget((currentTarget) =>
      currentTarget?.dayDate === nextDropTarget.dayDate &&
      currentTarget.index === nextDropTarget.index
        ? currentTarget
        : nextDropTarget,
    )
  }

  function handleDayDragOver(event: DragEvent<HTMLDivElement>, dayDate: string) {
    if (!draggedItem || event.target !== event.currentTarget) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const day = currentTrip.days.find((currentDay) => currentDay.date === dayDate)
    const nextDropTarget = {
      dayDate,
      index: day ? getDayItems(day).length : 0,
    }
    setDropTarget((currentTarget) =>
      currentTarget?.dayDate === nextDropTarget.dayDate &&
      currentTarget.index === nextDropTarget.index
        ? currentTarget
        : nextDropTarget,
    )
  }

  function queueDayItemReorder(trip: TripDetail, items: ReorderDayItemInput[]) {
    const reorderGeneration = ++reorderGenerationRef.current
    pendingReorderCountRef.current += 1
    const queuedRequest = reorderQueueRef.current.then(() =>
      reorderDayItems(accessToken, trip.id, items).then(() => undefined),
    )
    reorderQueueRef.current = queuedRequest.catch(() => undefined)

    void queuedRequest
      .then(() => {
        setActivityError(null)
      })
      .catch(async (reason: unknown) => {
        setActivityError(getErrorMessage(reason))

        if (
          pendingReorderCountRef.current > 1 ||
          reorderGeneration !== reorderGenerationRef.current
        ) {
          return
        }

        try {
          const refreshedTrip = await getTrip(accessToken, trip.id)
          if (
            pendingReorderCountRef.current === 1 &&
            reorderGeneration === reorderGenerationRef.current
          ) {
            onTripUpdated(refreshedTrip)
          }
        } catch (refreshReason: unknown) {
          setActivityError(`${getErrorMessage(reason)} ${getErrorMessage(refreshReason)}`)
        }
      })
      .finally(() => {
        pendingReorderCountRef.current -= 1
      })
  }

  function handleDayItemDrop(
    event: DragEvent<HTMLDivElement>,
    targetDate: string,
    rawTargetIndex: number,
  ) {
    event.preventDefault()
    event.stopPropagation()

    const draggedItemKey = draggedItem
      ? `${draggedItem.itemType}:${draggedItem.item.id}`
      : event.dataTransfer.getData("text/plain")
    setDropTarget(null)
    setDraggedItem(null)

    if (!draggedItemKey) {
      return
    }

    const [itemType, itemId] = draggedItemKey.split(":")
    if (itemType !== "activity" && itemType !== "meal") {
      return
    }

    const draggedRecord =
      draggedItem ??
      (itemType === "meal"
        ? (() => {
            const meal = currentTrip.meals.find((currentMeal) => currentMeal.id === itemId)
            return meal ? { itemType: "meal" as const, item: meal } : null
          })()
        : (() => {
            const activity = currentTrip.days
              .flatMap((day) => day.activities)
              .find((currentActivity) => currentActivity.id === itemId)
            return activity ? { itemType: "activity" as const, item: activity } : null
          })())
    const sourceDay = currentTrip.days.find((day) =>
      getDayItems(day).some((item) => item.id === itemId),
    )
    const targetDay = currentTrip.days.find((day) => day.date === targetDate)

    if (!sourceDay || !targetDay || !draggedRecord) {
      return
    }

    const sourceItems = getDayItems(sourceDay)
    const targetItems = getDayItems(targetDay).filter((item) => item.id !== itemId)
    const sourceIndex = sourceItems.findIndex((item) => item.id === itemId)
    const targetIndex =
      sourceDay.date === targetDate && sourceIndex < rawTargetIndex
        ? rawTargetIndex - 1
        : rawTargetIndex
    const desiredIndex = Math.max(0, Math.min(targetIndex, targetItems.length))
    const itemTime = getDayItemTime(draggedRecord.item)
    const firstLaterActivityIndex =
      itemTime === null
        ? -1
        : targetItems.findIndex((item) => {
            const candidateTime = getDayItemTime(item)
            return candidateTime !== null && candidateTime > itemTime
          })
    const lastEarlierActivityIndex =
      itemTime === null
        ? -1
        : targetItems.reduce((lastIndex, item, index) => {
            const candidateTime = getDayItemTime(item)
            return candidateTime !== null && candidateTime < itemTime ? index : lastIndex
          }, -1)
    const earliestLegalIndex = itemTime === null ? 0 : lastEarlierActivityIndex + 1
    const latestLegalIndex =
      firstLaterActivityIndex >= 0 ? firstLaterActivityIndex : targetItems.length
    const insertionIndex =
      itemTime === null
        ? desiredIndex
        : Math.max(earliestLegalIndex, Math.min(desiredIndex, latestLegalIndex))
    const nextTargetItems = [
      ...targetItems.slice(0, insertionIndex),
      draggedRecord.item,
      ...targetItems.slice(insertionIndex),
    ]
    const nextSourceItems =
      sourceDay.date === targetDate
        ? nextTargetItems
        : sourceItems.filter((item) => item.id !== itemId)
    const affectedDays = new Map<string, DayItem[]>([
      [sourceDay.date, nextSourceItems],
      [targetDate, nextTargetItems],
    ])
    const updates = Array.from(affectedDays.entries()).flatMap(([dayDate, items]) =>
      items.map((item, sortOrder) => ({
        item,
        dayDate,
        sortOrder,
        itemType: getDayItemRecord(item).itemType,
      })),
    )
    const changedUpdates = updates.filter(
      ({ item, dayDate, sortOrder }) => item.tripDate !== dayDate || item.sortOrder !== sortOrder,
    )

    if (changedUpdates.length === 0) {
      return
    }

    setActivityError(null)

    const optimisticTrip = buildOptimisticTrip(currentTrip, affectedDays)
    const reorderInput = getReorderInput(optimisticTrip)

    onTripUpdated(optimisticTrip)
    queueDayItemReorder(optimisticTrip, reorderInput)
  }

  function selectNewItemType(itemType: DayItemRecord["itemType"]) {
    resetActivityForm()
    setEditingItemType(itemType)
  }

  function renderDayItemForm(date: string) {
    return (
      <DayItemForm
        allDay={allDay}
        editingItemId={editingItemId}
        editingItemType={editingItemType}
        endTime={endTime}
        googleMapsError={googleMapsError}
        googleMapsUrl={googleMapsUrl}
        googleMapsUrlIsInvalid={googleMapsUrlIsInvalid}
        isMealForm={
          editingItemType === "meal" || (editingItemId === null && plannerTab === "meals")
        }
        isSaving={isSaving}
        notes={notes}
        onAllDayChange={setAllDay}
        onCancel={() => {
          resetActivityForm()
          setOpenDay(null)
        }}
        onEndTimeChange={handleEndTimeChange}
        onGoogleMapsUrlChange={(value) => {
          setGoogleMapsUrl(value)
          setGoogleMapsError(null)
        }}
        onNotesChange={setNotes}
        onSelectItemType={selectNewItemType}
        onStartTimeChange={handleStartTimeChange}
        onSubmit={(event) => void handleSaveDayItem(event, date)}
        onTitleChange={setTitle}
        startTime={startTime}
        title={title}
      />
    )
  }

  function renderMoveItemForm() {
    return (
      <MoveDayItemForm
        endDate={currentTrip.endDate}
        onCancel={cancelMovingItem}
        onSubmit={handleMoveItem}
        onTargetDateChange={setMoveTargetDate}
        startDate={currentTrip.startDate}
        targetDate={moveTargetDate}
      />
    )
  }

  async function handleSaveDayItem(event: FormEvent<HTMLFormElement>, date: string) {
    event.preventDefault()
    const normalizedGoogleMapsUrl = googleMapsUrl.trim()

    if (normalizedGoogleMapsUrl && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)) {
      setGoogleMapsError(t("errors.googleMapsInvalid"))
      setActivityError(null)
      return
    }

    setIsSaving(true)
    setActivityError(null)
    setGoogleMapsError(null)

    try {
      const input = {
        tripDate: date,
        isBackup: false,
        title: title.trim() || null,
        startTime: allDay || !startTime ? null : startTime,
        endTime: allDay || !endTime ? null : endTime,
        allDay,
        notes,
        googleMapsUrl: normalizedGoogleMapsUrl || null,
        placeName: null,
        placeAddress: null,
        latitude: null,
        longitude: null,
        priceAmount: null,
        priceCurrency: null,
        website: null,
      }
      let nextTrip: TripDetail
      let savedItem: DayItem

      if (editingItemType === "meal") {
        const meal = editingItemId
          ? await updateMeal(accessToken, currentTrip.id, editingItemId, input)
          : await createMeal(accessToken, currentTrip.id, {
              ...input,
              allDay: allDay,
              notes,
            })

        savedItem = meal
        nextTrip = {
          ...currentTrip,
          meals: editingItemId
            ? currentTrip.meals.map((currentMeal) =>
                currentMeal.id === meal.id ? meal : currentMeal,
              )
            : [...currentTrip.meals, meal],
        }
      } else {
        const activity = editingItemId
          ? await updateActivity(accessToken, currentTrip.id, editingItemId, input)
          : await createActivity(accessToken, currentTrip.id, input)

        savedItem = activity
        nextTrip = {
          ...currentTrip,
          days: currentTrip.days.map((day) =>
            day.date === date
              ? {
                  ...day,
                  activities: sortActivities(
                    editingItemId
                      ? day.activities.map((currentActivity) =>
                          currentActivity.id === editingItemId ? activity : currentActivity,
                        )
                      : [...day.activities, activity],
                  ),
                }
              : day,
          ),
        }
      }

      const shouldReorderItem =
        editingItemId !== null ||
        (editingItemType === "activity" && getDayItemTime(savedItem) === null)
      const targetDay = nextTrip.days.find((day) => day.date === date)

      if (shouldReorderItem && targetDay) {
        const targetItems = insertDayItemByTime(
          getDayItems(targetDay, nextTrip.meals),
          savedItem,
          !editingItemId && editingItemType === "activity",
        )
        const optimisticTrip = buildOptimisticTrip(nextTrip, new Map([[date, targetItems]]))
        onTripUpdated(optimisticTrip)
        queueDayItemReorder(optimisticTrip, getReorderInput(optimisticTrip))
      } else {
        onTripUpdated(nextTrip)
      }
      resetActivityForm()
      setOpenDay(null)
    } catch (reason: unknown) {
      const message = getErrorMessage(reason)
      if (isGoogleMapsError(reason)) {
        setGoogleMapsError(message)
      } else {
        setActivityError(message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteActivity(activity: Activity) {
    setDeletingActivityId(activity.id)
    setActivityError(null)

    try {
      await deleteActivity(accessToken, currentTrip.id, activity.id)
      onTripUpdated({
        ...currentTrip,
        days: currentTrip.days.map((day) => ({
          ...day,
          activities: day.activities.filter((current) => current.id !== activity.id),
        })),
      })
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    } finally {
      setDeletingActivityId(null)
    }
  }

  async function handleDeleteMeal(meal: Meal) {
    setDeletingActivityId(meal.id)
    setActivityError(null)

    try {
      await deleteMeal(accessToken, currentTrip.id, meal.id)
      onTripUpdated({
        ...currentTrip,
        meals: currentTrip.meals.filter((currentMeal) => currentMeal.id !== meal.id),
      })
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    } finally {
      setDeletingActivityId(null)
    }
  }

  function requestDeleteActivity(activity: Activity) {
    setPendingDeletion({ item: activity, type: "activity" })
  }

  function requestDeleteMeal(meal: Meal) {
    setPendingDeletion({ item: meal, type: "meal" })
  }

  function confirmPendingDeletion() {
    const deletion = pendingDeletion
    setPendingDeletion(null)

    if (!deletion) {
      return
    }

    if (deletion.type === "activity") {
      void handleDeleteActivity(deletion.item)
    } else {
      void handleDeleteMeal(deletion.item)
    }
  }

  function editDayDetails(date: string, title: string | null, note: string | null) {
    setEditingDayDate(date)
    setDayTitle(title ?? "")
    setDayNotes(note ?? "")
  }

  async function handleSaveDayDetails(date: string) {
    setIsSavingDayDetails(true)
    setActivityError(null)

    try {
      const updatedDay = await updateTripDay(accessToken, currentTrip.id, date, {
        title: dayTitle.trim() || null,
        notes: dayNotes,
      })
      onTripUpdated({
        ...currentTrip,
        days: currentTrip.days.map((day) =>
          day.date === date ? { ...day, title: updatedDay.title, notes: updatedDay.notes } : day,
        ),
      })
      setEditingDayDate(null)
    } catch (reason: unknown) {
      setActivityError(getErrorMessage(reason))
    } finally {
      setIsSavingDayDetails(false)
    }
  }

  function handlePlannerViewChange(value: string) {
    if (value === "housing") {
      setShowMobileHousing(true)
      return
    }

    if (value === "all" || value === "activities" || value === "meals") {
      setShowMobileHousing(false)
      setPlannerTab(value)
    }
  }

  async function handlePreferenceChange(
    itemType: TripItemType,
    itemId: string,
    value: TripItemPreferenceValue | null,
  ) {
    if (!trip) {
      return
    }

    const preferenceKey = `${itemType}:${itemId}`
    const previousPreferences = trip.preferences
    const optimisticPreferences = previousPreferences.filter(
      (preference) =>
        !(
          preference.userId === userId &&
          preference.itemType === itemType &&
          preference.itemId === itemId
        ),
    )

    if (value !== null) {
      optimisticPreferences.push({
        id: `optimistic:${preferenceKey}`,
        tripId: trip.id,
        userId,
        itemType,
        itemId,
        value,
        updatedAt: new Date().toISOString(),
      })
    }

    setSavingPreferenceKey(preferenceKey)
    onTripUpdated({ ...trip, preferences: optimisticPreferences })

    try {
      const savedPreference = await setTripItemPreference(accessToken, trip.id, {
        itemType,
        itemId,
        value,
      })
      const remainingPreferences = optimisticPreferences.filter(
        (preference) =>
          !(
            preference.userId === userId &&
            preference.itemType === itemType &&
            preference.itemId === itemId
          ),
      )

      if (savedPreference) {
        remainingPreferences.push(savedPreference)
      }

      onTripUpdated({ ...trip, preferences: remainingPreferences })
    } catch (reason: unknown) {
      onTripUpdated({ ...trip, preferences: previousPreferences })
      setActivityError(getErrorMessage(reason))
    } finally {
      setSavingPreferenceKey(null)
    }
  }

  function renderDayHousing(dayDate: string) {
    const isSelectedDay = dayDate === selectedDay.date

    return (
      <TripAuxiliaryDetails
        accessToken={accessToken}
        onTripUpdated={onTripUpdated}
        onMoveHousingToBackup={(stay) => void moveHousingToBackup(stay)}
        onLocateHousing={handleLocateHousing}
        onPreferenceChange={(itemType, itemId, value) => {
          void handlePreferenceChange(itemType, itemId, value)
        }}
        highlightedHousingId={
          highlightedMapItemKey?.startsWith("housing:")
            ? highlightedMapItemKey.slice("housing:".length)
            : null
        }
        mapHousingAction={isSelectedDay ? mapHousingAction : null}
        onMapHousingActionHandled={isSelectedDay ? () => setMapHousingAction(null) : undefined}
        currencies={currencies}
        onSaveDetails={handleSaveHousingDetails}
        showDetails={showDetails}
        selectedDayDate={dayDate}
        selectedDayDates={[dayDate]}
        savingPreferenceKey={savingPreferenceKey}
        trip={currentTrip}
        userId={userId}
      />
    )
  }

  return (
    <div className="mt-6">
      <TripDetailsHeader
        onToggleSettings={() => setShowSettings((current) => !current)}
        showSettings={showSettings}
        trip={trip}
      />
      {showSettings && (
        <TripSettings
          accessToken={accessToken}
          onClose={() => setShowSettings(false)}
          onDelete={onTripDeleted}
          onSaved={onTripUpdated}
          trip={trip}
        />
      )}
      {activityError && (
        <p className="mt-4 rounded-xl border border-danger-border bg-error-surface p-3 text-sm text-error">
          {activityError}
        </p>
      )}
      <div className="mt-4 pb-24 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_minmax(22rem,32rem)] lg:items-start lg:gap-5 lg:pb-0">
        <TripDayNavigator
          days={trip.days}
          housingStays={trip.housingStays}
          onSelectAll={onSelectAll}
          onSelectDay={onSelectDay}
          onToggleDay={onToggleDay}
          selectedDay={selectedDay}
          selectedDayDates={selectedDayDates}
        />

        <div className="min-w-0">
          <div className="sticky top-3 z-20 mb-4 lg:static">
            <label className="sr-only" htmlFor="mobile-planner-view">
              {t("tripDetails.plannerView")}
            </label>
            <select
              aria-label={t("tripDetails.plannerView")}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-on-surface shadow-card outline-none focus:border-brand lg:hidden"
              id="mobile-planner-view"
              onChange={(event) => handlePlannerViewChange(event.target.value)}
              value={showMobileHousing ? "housing" : plannerTab}
            >
              <option value="all">{t("tripDetails.all")}</option>
              <option value="activities">{t("tripDetails.activities")}</option>
              <option value="meals">{t("tripDetails.meals")}</option>
              <option value="housing">{t("tripDetails.housing")}</option>
            </select>
            <div className="hidden rounded-xl bg-surface-muted p-1 lg:grid lg:grid-cols-3">
              {(["all", "activities", "meals"] as const).map((tab) => (
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    !showMobileHousing && plannerTab === tab
                      ? "bg-surface text-on-surface shadow-sm"
                      : "text-muted"
                  }`}
                  key={tab}
                  onClick={() => {
                    setShowMobileHousing(false)
                    setPlannerTab(tab)
                  }}
                  type="button"
                >
                  {tab === "all"
                    ? t("tripDetails.all")
                    : tab === "activities"
                      ? t("tripDetails.activities")
                      : t("tripDetails.meals")}
                </button>
              ))}
            </div>
          </div>
          <div className={`${showMobileHousing ? "block" : "hidden"} lg:hidden`}>
            <TripAuxiliaryDetails
              accessToken={accessToken}
              onTripUpdated={onTripUpdated}
              onMoveHousingToBackup={(stay) => void moveHousingToBackup(stay)}
              onLocateHousing={handleLocateHousing}
              onPreferenceChange={(itemType, itemId, value) => {
                void handlePreferenceChange(itemType, itemId, value)
              }}
              highlightedHousingId={
                highlightedMapItemKey?.startsWith("housing:")
                  ? highlightedMapItemKey.slice("housing:".length)
                  : null
              }
              mapHousingAction={mapHousingAction}
              onMapHousingActionHandled={() => setMapHousingAction(null)}
              currencies={currencies}
              onSaveDetails={handleSaveHousingDetails}
              showDetails={showDetails}
              savingPreferenceKey={savingPreferenceKey}
              trip={currentTrip}
              userId={userId}
            />
          </div>
          <MobileDayPager
            days={trip.days}
            onSelectDate={(date) => onSelectDay(date, false)}
            selectedDate={mobileSelectedDate}
          >
            <div className={`grid ${showMobileHousing ? "hidden lg:grid" : ""}`}>
              {trip.days.map((day, dayIndex) => (
                <TripDayCard
                  day={day}
                  dayNotes={dayNotes}
                  dayTitle={dayTitle}
                  editingDayDate={editingDayDate}
                  editingItemId={editingItemId}
                  isSavingDayDetails={isSavingDayDetails}
                  isSelected={selectedDayDates.includes(day.date)}
                  isMobileSelected={day.date === mobileSelectedDate}
                  key={day.date}
                  onCancelDayDetails={() => setEditingDayDate(null)}
                  onDayNotesChange={setDayNotes}
                  onDayTitleChange={setDayTitle}
                  onEditDayDetails={editDayDetails}
                  onSaveDayDetails={(date) => void handleSaveDayDetails(date)}
                  onToggleActivityForm={toggleActivityForm}
                  openDay={openDay}
                  renderItemForm={renderDayItemForm}
                  showDividerOnDesktop={
                    dayIndex > 0 &&
                    selectedDayDates.includes(day.date) &&
                    trip.days
                      .slice(0, dayIndex)
                      .some((previousDay) => selectedDayDates.includes(previousDay.date))
                  }
                  showDividerOnMobile={dayIndex > 0}
                >
                  {renderDayHousing(day.date)}
                  <DayItemList
                    day={day}
                    deletingItemId={deletingActivityId}
                    draggedItem={draggedItem}
                    dropTarget={dropTarget}
                    editingItemId={editingItemId}
                    getDayItemRecord={getDayItemRecord}
                    getDropIndex={getDropIndex}
                    itemType={plannerTab}
                    items={getDayItems(day)}
                    movingItem={movingItem}
                    onDayDragOver={handleDayDragOver}
                    onDayDrop={(event, date, itemCount) => {
                      void handleDayItemDrop(event, date, itemCount)
                    }}
                    onDeleteActivity={(activity) => {
                      requestDeleteActivity(activity)
                    }}
                    onDeleteMeal={(meal) => {
                      requestDeleteMeal(meal)
                    }}
                    onEditActivity={editActivity}
                    onEditMeal={editMeal}
                    onMoveActivityToBackup={(activity) => void moveActivityToBackup(activity)}
                    onMoveMealToBackup={(meal) => void moveMealToBackup(meal)}
                    onLocateItem={handleLocateItem}
                    onItemDragEnd={() => {
                      setDraggedItem(null)
                      setDropTarget(null)
                    }}
                    onItemDragOver={handleDayItemDragOver}
                    onItemDragStart={handleDayItemDragStart}
                    onItemDrop={(event, date, itemIndex) => {
                      void handleDayItemDrop(event, date, itemIndex)
                    }}
                    onStartMoving={startMovingItem}
                    onPreferenceChange={(itemType, itemId, value) => {
                      void handlePreferenceChange(itemType, itemId, value)
                    }}
                    currencies={currencies}
                    onSaveDetails={(record, details) => handleSaveDayItemDetails(record, details)}
                    showDetails={showDetails}
                    renderEditForm={renderDayItemForm}
                    renderMoveForm={renderMoveItemForm}
                    highlightedItemKey={highlightedMapItemKey}
                    preferences={currentTrip.preferences}
                    savingPreferenceKey={savingPreferenceKey}
                    userId={userId}
                  />
                </TripDayCard>
              ))}
            </div>
          </MobileDayPager>
        </div>
        <aside className="contents lg:block">
          <TripMap
            accessToken={accessToken}
            focusMarker={mapFocusMarker}
            markers={mapMarkers}
            onMarkerClick={handleMapMarkerClick}
            onMarkerLocationSave={handleSaveMarkerLocation}
            onFocusMarkerHandled={() => setMapFocusMarker(null)}
            renderMarkerDetails={(marker) => (
              <TripMapMarkerDetails
                marker={marker}
                trip={currentTrip}
                itemDetailVisibility={itemDetailVisibility}
                savingPreferenceKey={savingPreferenceKey}
                userId={userId}
                onMapHousingAction={setMapHousingAction}
                onEditActivity={editActivity}
                onRequestDeleteActivity={requestDeleteActivity}
                onEditMeal={editMeal}
                onRequestDeleteMeal={requestDeleteMeal}
                onPreferenceChange={(itemType, itemId, value) =>
                  void handlePreferenceChange(itemType, itemId, value)
                }
              />
            )}
          />
        </aside>
      </div>
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        isOpen={pendingDeletion !== null}
        message={
          pendingDeletion
            ? pendingDeletion.type === "activity"
              ? t("tripDetails.deleteActivityConfirmation", {
                  name:
                    pendingDeletion.item.title ??
                    pendingDeletion.item.placeName ??
                    t("tripDetails.untitledItem"),
                })
              : t("tripDetails.deleteMealConfirmation", {
                  name:
                    pendingDeletion.item.title ??
                    pendingDeletion.item.placeName ??
                    t("tripDetails.untitledItem"),
                })
            : ""
        }
        onCancel={() => setPendingDeletion(null)}
        onConfirm={confirmPendingDeletion}
        title={t("common.confirmDeletionTitle")}
      />
    </div>
  )
}
