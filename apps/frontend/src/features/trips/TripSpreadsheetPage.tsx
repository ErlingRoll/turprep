import { Fragment, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createHousingStay,
  createMeal,
  deleteActivity,
  deleteHousingStay,
  deleteMeal,
  updateActivity,
  updateTripDay,
  updateHousingStay,
  updateMeal,
  setTripItemPreference,
  type Activity,
  type HousingStay,
  type Meal,
  type TripDetail,
} from "../../api"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { SettingsIcon } from "../../components/SettingsIcon"
import { useToast } from "../../components/ToastContext"
import { DayItemForm } from "./DayItemForm"
import { getDateLocale } from "../../i18n"
import { getDayItemTitle, sortDayItems } from "../../lib/activity-format"
import { getDefaultCurrency } from "../../lib/currency"
import { formatDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import { shiftDate } from "../../lib/trip-dates"
import {
  isAllowedGoogleMapsUrl,
  type TripItemPreferenceValue,
  type TripItemType,
} from "@turprep/models"
import { replaceActivityInTrip, replaceHousingStayInTrip, replaceMealInTrip } from "./trip-state"
import { TripSettings } from "./TripSettings"
import { SpreadsheetHeaderCell } from "./SpreadsheetCell"
import {
  getDraggedItemKey,
  getItineraryRowKey,
  getNearestSpreadsheetDropTarget,
  isDragBlockedTarget,
  setSpreadsheetDragData,
} from "./spreadsheet-drag"
import {
  calculateSpreadsheetReorder,
  queueSpreadsheetReorder,
  type SpreadsheetItemTimeUpdate,
} from "./spreadsheet-reorder"
import { SpreadsheetHousingContent } from "./SpreadsheetHousingContent"
import { SpreadsheetItineraryRow } from "./SpreadsheetItineraryRow"
import { getSpreadsheetItemDraft } from "./spreadsheet-item-draft"
import {
  applyDefaultEndTimeForStartEdit,
  getDefaultEndTimeForStart,
  getRowsForTimeEdit,
  getTimeOrderValidationError,
} from "./spreadsheet-time-validation"
import type {
  EditableField,
  HousingDraft,
  HousingEditableField,
  ItemDraft,
  ItineraryRow,
  SpreadsheetDraggedItem,
  SpreadsheetDropTarget,
  SpreadsheetPendingDeletion,
} from "./spreadsheet-types"

function getHousingDraft(stay: HousingStay): HousingDraft {
  return {
    checkIn: stay.checkIn ?? "",
    checkOut: stay.checkOut ?? "",
    googleMapsUrl: stay.googleMapsUrl ?? "",
    name: stay.name,
    notes: stay.notes ?? "",
    priceAmount: stay.priceAmount === null ? "" : String(stay.priceAmount),
    priceCurrency: stay.priceCurrency ?? "",
    website: stay.website ?? "",
  }
}

type TripSpreadsheetPageProps = {
  accessToken: string
  onTripDeleted: (trip: TripDetail) => Promise<void>
  onOpenMap: (itemType: "activity" | "meal", itemId: string) => void
  onPreferencePendingChange: (isPending: boolean) => void
  onReorderPendingChange: (isPending: boolean) => void
  onTripUpdated: (trip: TripDetail) => void
  trip: TripDetail
  userId: string
  showDetails: boolean
}

type CreateItemDraft = ItemDraft & {
  googleMapsUrl: string
}

const housingEditableFields: HousingEditableField[] = [
  "name",
  "checkIn",
  "checkOut",
  "notes",
  "price",
  "website",
]

function getItineraryRows(trip: TripDetail, date: string): ItineraryRow[] {
  const day = trip.days.find((currentDay) => currentDay.date === date)
  const meals = trip.meals.filter((meal) => !meal.isBackup && meal.tripDate === date)
  const activityIds = new Set(day?.activities.map((activity) => activity.id))

  return sortDayItems([...(day?.activities ?? []), ...meals]).map((item) => ({
    item,
    type: activityIds.has(item.id) ? "activity" : "meal",
  }))
}

function getCreateItemDraft(): CreateItemDraft {
  return {
    allDay: true,
    endTime: "",
    googleMapsUrl: "",
    notes: "",
    startTime: "",
    title: "",
  }
}

function sortRowsByTime(rows: ItineraryRow[]): ItineraryRow[] {
  const typeByItemId = new Map(rows.map((row) => [row.item.id, row.type]))
  return sortDayItems(rows.map(({ item }) => ({ ...item, sortOrder: 0 }))).map((item) => ({
    item,
    type: typeByItemId.get(item.id) ?? "activity",
  }))
}

export function TripSpreadsheetPage({
  accessToken,
  onTripDeleted,
  onOpenMap,
  onPreferencePendingChange,
  onReorderPendingChange,
  onTripUpdated,
  trip,
  userId,
  showDetails,
}: TripSpreadsheetPageProps) {
  const { i18n, t } = useTranslation()
  const { addToast } = useToast()
  const locale = getDateLocale(i18n.language)
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [housingEditingKey, setHousingEditingKey] = useState<string | null>(null)
  const [housingDraft, setHousingDraft] = useState<HousingDraft | null>(null)
  const [creatingHousingDayDate, setCreatingHousingDayDate] = useState<string | null>(null)
  const [housingCreateDraft, setHousingCreateDraft] = useState<HousingDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [creatingDayDate, setCreatingDayDate] = useState<string | null>(null)
  const [creatingItemType, setCreatingItemType] = useState<ItineraryRow["type"]>("activity")
  const [createDraft, setCreateDraft] = useState<CreateItemDraft>(getCreateItemDraft)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createGoogleMapsError, setCreateGoogleMapsError] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<SpreadsheetDraggedItem | null>(null)
  const [dropTarget, setDropTargetState] = useState<SpreadsheetDropTarget | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<SpreadsheetPendingDeletion | null>(null)
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [editingDayTitleDate, setEditingDayTitleDate] = useState<string | null>(null)
  const [dayTitleDraft, setDayTitleDraft] = useState("")
  const [dayTitleError, setDayTitleError] = useState<string | null>(null)
  const [isSavingDayTitle, setIsSavingDayTitle] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const dropTargetRef = useRef<SpreadsheetDropTarget | null>(null)
  const latestTripRef = useRef(trip)
  const reorderQueueRef = useRef(Promise.resolve())
  const pendingReorderCountRef = useRef(0)
  const pendingPreferenceCountRef = useRef(0)
  const reorderGenerationRef = useRef(0)
  const showPrice = showDetails && trip.itemDetailVisibility.showPrice
  const showWebsite = showDetails && trip.itemDetailVisibility.showWebsite
  const currencies =
    trip.acceptedCurrencies.length > 0 ? trip.acceptedCurrencies : [getDefaultCurrency()]
  const housingStays = trip.housingStays.filter((stay) => !stay.isBackup)
  const itineraryRows = trip.days.map((day) => ({
    day,
    rows: getItineraryRows(trip, day.date),
  }))
  const housingByDay = trip.days.map((day) =>
    housingStays.find(
      (stay) =>
        stay.checkIn !== null &&
        stay.checkOut !== null &&
        stay.checkIn <= day.date &&
        day.date < stay.checkOut,
    ),
  )
  const rowCounts = itineraryRows.map(
    ({ day, rows }) => 1 + Math.max(rows.length, 1) + (creatingDayDate === day.date ? 1 : 0),
  )
  const getHousingRowSpan = (startIndex: number) => {
    if (!housingByDay[startIndex]) {
      return rowCounts[startIndex]
    }

    const housingId = housingByDay[startIndex]?.id ?? null
    let endIndex = startIndex

    while (endIndex < rowCounts.length && (housingByDay[endIndex]?.id ?? null) === housingId) {
      endIndex += 1
    }

    return rowCounts.slice(startIndex, endIndex).reduce((total, count) => total + count, 0)
  }
  const itineraryColumnCount = 7 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)

  useEffect(() => {
    if (pendingReorderCountRef.current === 0) {
      latestTripRef.current = trip
    }
  }, [trip])

  useEffect(() => {
    if (!reorderError) {
      return
    }

    addToast(reorderError)
    setReorderError(null)
  }, [addToast, reorderError])

  useEffect(() => {
    if (!saveError || editingFieldKey || housingEditingKey || housingCreateDraft) {
      return
    }

    addToast(saveError)
    setSaveError(null)
  }, [addToast, editingFieldKey, housingCreateDraft, housingEditingKey, saveError])

  const dropLineBounds = tableRef.current?.getBoundingClientRect()
  const draggedItemKey = draggedItem ? `${draggedItem.itemType}:${draggedItem.itemId}` : null
  const draggedItemSourceIndex = draggedItem
    ? getItineraryRows(latestTripRef.current, draggedItem.dayDate).findIndex(
        (row) => getItineraryRowKey(row) === draggedItemKey,
      )
    : -1
  const isDropLineSuppressed =
    draggedItemSourceIndex >= 0 &&
    dropTarget?.dayDate === draggedItem?.dayDate &&
    (dropTarget?.index === draggedItemSourceIndex ||
      dropTarget?.index === draggedItemSourceIndex + 1)

  function setDropTarget(nextTarget: SpreadsheetDropTarget | null) {
    dropTargetRef.current = nextTarget
    setDropTargetState(nextTarget)
  }

  function startEditingDayTitle(day: TripDetail["days"][number]) {
    setEditingDayTitleDate(day.date)
    setDayTitleDraft(day.title ?? "")
    setDayTitleError(null)
  }

  function cancelEditingDayTitle() {
    setEditingDayTitleDate(null)
    setDayTitleDraft("")
    setDayTitleError(null)
  }

  async function saveDayTitle(date: string) {
    setIsSavingDayTitle(true)
    setDayTitleError(null)

    try {
      const updatedDay = await updateTripDay(accessToken, trip.id, date, {
        title: dayTitleDraft.trim() || null,
      })
      onTripUpdated({
        ...trip,
        days: trip.days.map((day) =>
          day.date === date ? { ...day, title: updatedDay.title } : day,
        ),
      })
      cancelEditingDayTitle()
    } catch (reason: unknown) {
      setDayTitleError(getErrorMessage(reason))
    } finally {
      setIsSavingDayTitle(false)
    }
  }

  function startCreatingItem(dayDate: string, itemType: ItineraryRow["type"]) {
    if (isSaving) {
      return
    }

    setCreatingDayDate(dayDate)
    setCreatingItemType(itemType)
    setCreateDraft(getCreateItemDraft())
    setCreateError(null)
    setCreateGoogleMapsError(null)
  }

  function cancelCreatingItem() {
    if (isSaving) {
      return
    }

    setCreatingDayDate(null)
    setCreateDraft(getCreateItemDraft())
    setCreateError(null)
    setCreateGoogleMapsError(null)
  }

  function renderCreateItemForm(dayDate: string) {
    const dayRows = getItineraryRows(trip, dayDate)
    return (
      <>
        <DayItemForm
          allDay={createDraft.allDay}
          editingItemId={null}
          editingItemType={creatingItemType}
          endTime={createDraft.endTime}
          googleMapsError={createGoogleMapsError}
          googleMapsUrl={createDraft.googleMapsUrl}
          googleMapsUrlIsInvalid={
            createDraft.googleMapsUrl.trim().length > 0 &&
            !isAllowedGoogleMapsUrl(createDraft.googleMapsUrl.trim())
          }
          isMealForm={creatingItemType === "meal"}
          isSaving={isSaving}
          notes={createDraft.notes}
          onAllDayChange={(allDay) => setCreateDraft((current) => ({ ...current, allDay }))}
          onCancel={cancelCreatingItem}
          onEndTimeChange={(endTime) => setCreateDraft((current) => ({ ...current, endTime }))}
          onGoogleMapsUrlChange={(googleMapsUrl) => {
            setCreateDraft((current) => ({ ...current, googleMapsUrl }))
            setCreateGoogleMapsError(null)
          }}
          onNotesChange={(notes) => setCreateDraft((current) => ({ ...current, notes }))}
          onSelectItemType={setCreatingItemType}
          onStartTimeChange={(startTime) =>
            setCreateDraft((current) => {
              if (!startTime) {
                return { ...current, allDay: true, endTime: "", startTime }
              }

              const defaultEndTime = current.endTime
                ? current.endTime
                : getDefaultEndTimeForStart(dayRows, startTime)

              return {
                ...current,
                allDay: false,
                endTime: defaultEndTime ?? "",
                startTime,
              }
            })
          }
          onSubmit={(event) => void saveNewItem(event, dayDate)}
          onTitleChange={(title) => setCreateDraft((current) => ({ ...current, title }))}
          startTime={createDraft.startTime}
          title={createDraft.title}
        />
        {createError && <p className="mt-2 text-sm text-error">{createError}</p>}
      </>
    )
  }

  async function saveNewItem(event: FormEvent<HTMLFormElement>, dayDate: string) {
    event.preventDefault()
    const normalizedGoogleMapsUrl = createDraft.googleMapsUrl.trim()

    if (normalizedGoogleMapsUrl && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)) {
      setCreateGoogleMapsError(t("errors.googleMapsInvalid"))
      setCreateError(null)
      return
    }

    setIsSaving(true)
    setCreateError(null)
    setCreateGoogleMapsError(null)

    try {
      const input = {
        tripDate: dayDate,
        isBackup: false,
        title: createDraft.title.trim() || null,
        startTime: createDraft.allDay || !createDraft.startTime ? null : createDraft.startTime,
        endTime: createDraft.allDay || !createDraft.endTime ? null : createDraft.endTime,
        allDay: createDraft.allDay,
        notes: createDraft.notes.trim() || null,
        googleMapsUrl: normalizedGoogleMapsUrl || null,
        placeName: null,
        placeAddress: null,
        latitude: null,
        longitude: null,
        priceAmount: null,
        priceCurrency: null,
        website: null,
      }
      const createdItem =
        creatingItemType === "meal"
          ? await createMeal(accessToken, trip.id, input)
          : await createActivity(accessToken, trip.id, input)
      const nextTrip: TripDetail =
        creatingItemType === "meal"
          ? { ...trip, meals: [...trip.meals, createdItem] }
          : {
              ...trip,
              days: trip.days.map((day) =>
                day.date === dayDate
                  ? { ...day, activities: [...day.activities, createdItem] }
                  : day,
              ),
            }
      const normalizedRows = sortRowsByTime(getItineraryRows(nextTrip, dayDate))
      const optimisticTrip = getOptimisticReorderedTrip(
        nextTrip,
        new Map([[dayDate, normalizedRows]]),
        new Map(),
      )

      latestTripRef.current = optimisticTrip
      onTripUpdated(optimisticTrip)
      queueReorder(optimisticTrip, new Map([[dayDate, normalizedRows]]), new Map())
      setCreatingDayDate(null)
      setCreateDraft(getCreateItemDraft())
      setCreateError(null)
      setCreateGoogleMapsError(null)
    } catch (reason: unknown) {
      setCreateError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveItemGoogleMapsUrl(
    type: ItineraryRow["type"],
    item: Activity | Meal,
    googleMapsUrl: string | null,
  ): Promise<string | null> {
    setSaveError(null)

    try {
      if (type === "meal") {
        const savedMeal = await updateMeal(accessToken, trip.id, item.id, { googleMapsUrl })
        onTripUpdated(replaceMealInTrip(trip, savedMeal))
      } else {
        const savedActivity = await updateActivity(accessToken, trip.id, item.id, { googleMapsUrl })
        onTripUpdated(replaceActivityInTrip(trip, savedActivity))
      }

      return null
    } catch (reason: unknown) {
      return getErrorMessage(reason)
    } finally {
      setIsSaving(false)
    }
  }

  async function moveItemToBackup(type: ItineraryRow["type"], item: Activity | Meal) {
    setSaveError(null)

    try {
      if (type === "meal") {
        const savedMeal = await updateMeal(accessToken, trip.id, item.id, { isBackup: true })
        onTripUpdated(replaceMealInTrip(trip, savedMeal))
      } else {
        const savedActivity = await updateActivity(accessToken, trip.id, item.id, {
          isBackup: true,
        })
        onTripUpdated({
          ...trip,
          backupActivities: [...trip.backupActivities, savedActivity],
          days: trip.days.map((day) => ({
            ...day,
            activities: day.activities.filter((activity) => activity.id !== item.id),
          })),
        })
      }
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePreferenceChange(
    itemType: TripItemType,
    itemId: string,
    value: TripItemPreferenceValue | null,
  ) {
    const preferenceKey = `${itemType}:${itemId}`
    const previousPreferences = latestTripRef.current.preferences
    const currentTrip = latestTripRef.current
    const nextPreferences = previousPreferences.filter(
      (preference) =>
        !(
          preference.userId === userId &&
          preference.itemType === itemType &&
          preference.itemId === itemId
        ),
    )

    if (value !== null) {
      nextPreferences.push({
        id: `optimistic:${preferenceKey}`,
        tripId: trip.id,
        userId,
        itemType,
        itemId,
        value,
        updatedAt: new Date().toISOString(),
      })
    }

    if (pendingPreferenceCountRef.current === 0) {
      onPreferencePendingChange(true)
    }
    pendingPreferenceCountRef.current += 1
    setSavingPreferenceKey(preferenceKey)
    setSaveError(null)
    onTripUpdated({ ...currentTrip, preferences: nextPreferences })

    try {
      const savedPreference = await setTripItemPreference(accessToken, trip.id, {
        itemType,
        itemId,
        value,
      })
      const reconciledPreferences = latestTripRef.current.preferences.filter(
        (preference) =>
          !(
            preference.userId === userId &&
            preference.itemType === itemType &&
            preference.itemId === itemId
          ),
      )

      if (savedPreference) {
        reconciledPreferences.push(savedPreference)
      }

      onTripUpdated({ ...latestTripRef.current, preferences: reconciledPreferences })
    } catch (reason: unknown) {
      const rolledBackPreferences = latestTripRef.current.preferences.filter(
        (preference) =>
          !(
            preference.userId === userId &&
            preference.itemType === itemType &&
            preference.itemId === itemId
          ),
      )
      const previousPreference = previousPreferences.find(
        (preference) =>
          preference.userId === userId &&
          preference.itemType === itemType &&
          preference.itemId === itemId,
      )
      if (previousPreference) {
        rolledBackPreferences.push(previousPreference)
      }
      onTripUpdated({ ...latestTripRef.current, preferences: rolledBackPreferences })
      setSaveError(getErrorMessage(reason))
    } finally {
      pendingPreferenceCountRef.current -= 1
      if (pendingPreferenceCountRef.current === 0) {
        onPreferencePendingChange(false)
      }
      setSavingPreferenceKey(null)
    }
  }

  async function confirmPendingDeletion() {
    if (!pendingDeletion) {
      return
    }

    if ("housing" in pendingDeletion) {
      await confirmHousingDeletion(pendingDeletion.housing)
      return
    }

    const { item, type } = pendingDeletion
    setIsSaving(true)
    setSaveError(null)

    try {
      if (type === "meal") {
        await deleteMeal(accessToken, trip.id, item.id)
        onTripUpdated({
          ...trip,
          meals: trip.meals.filter((meal) => meal.id !== item.id),
        })
      } else {
        await deleteActivity(accessToken, trip.id, item.id)
        onTripUpdated({
          ...trip,
          days: trip.days.map((day) => ({
            ...day,
            activities: day.activities.filter((activity) => activity.id !== item.id),
          })),
        })
      }

      setPendingDeletion(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  function getOptimisticReorderedTrip(
    baseTrip: TripDetail,
    rowsByDate: Map<string, ItineraryRow[]>,
    timeUpdates: Map<string, SpreadsheetItemTimeUpdate>,
  ): TripDetail {
    const rowByItemKey = new Map<
      string,
      { dayDate: string; row: ItineraryRow; sortOrder: number }
    >()

    rowsByDate.forEach((rows, dayDate) => {
      rows.forEach((row, sortOrder) => {
        rowByItemKey.set(getItineraryRowKey(row), { dayDate, row, sortOrder })
      })
    })

    return {
      ...baseTrip,
      days: baseTrip.days.map((day) => {
        const rows = rowsByDate.get(day.date)
        if (!rows) {
          return day
        }

        return {
          ...day,
          activities: rows.flatMap((row, sortOrder) =>
            row.type === "activity"
              ? [
                  {
                    ...row.item,
                    tripDate: day.date,
                    sortOrder,
                    ...(timeUpdates.get(getItineraryRowKey(row)) ?? {}),
                  },
                ]
              : [],
          ),
        }
      }),
      meals: baseTrip.meals.map((meal) => {
        const placement = rowByItemKey.get(`meal:${meal.id}`)
        if (!placement) {
          return meal
        }

        return {
          ...meal,
          tripDate: placement.dayDate,
          sortOrder: placement.sortOrder,
          ...(timeUpdates.get(`meal:${meal.id}`) ?? {}),
        }
      }),
    }
  }

  function handleSpreadsheetDragStart(
    event: DragEvent<HTMLTableRowElement>,
    dayDate: string,
    row: ItineraryRow,
  ) {
    if (isDragBlockedTarget(event.target)) {
      event.preventDefault()
      return
    }

    setSpreadsheetDragData(
      event,
      getItineraryRowKey(row),
      `${row.type === "activity" ? t("spreadsheet.activity") : t("spreadsheet.meal")} · ${getDayItemTitle(
        row.item,
        t("tripDetails.untitledItem"),
      )}`,
    )
    setDraggedItem({
      dayDate,
      itemId: row.item.id,
      itemType: row.type,
    })
    setReorderError(null)
  }

  function handleSpreadsheetDragOver(event: DragEvent<HTMLTableRowElement>, dayDate: string) {
    if (!draggedItem) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const nextDropTarget = getNearestSpreadsheetDropTarget(tableRef.current, dayDate, event.clientY)
    const currentTarget = dropTargetRef.current
    if (
      nextDropTarget &&
      (currentTarget?.dayDate !== nextDropTarget.dayDate ||
        currentTarget.index !== nextDropTarget.index ||
        currentTarget.lineY !== nextDropTarget.lineY)
    ) {
      setDropTarget(nextDropTarget)
    }
  }

  function handleSpreadsheetDragEnd() {
    setDraggedItem(null)
    setDropTarget(null)
  }

  function queueReorder(
    optimisticTrip: TripDetail,
    rowsByDate: Map<string, ItineraryRow[]>,
    timeUpdates: Map<string, SpreadsheetItemTimeUpdate>,
  ) {
    queueSpreadsheetReorder({
      accessToken,
      groupDates: new Map(Array.from(rowsByDate.keys()).map((date) => [date, date])),
      onError: setReorderError,
      onPendingChange: onReorderPendingChange,
      onSuccess: () => setReorderError(null),
      onTripUpdated,
      latestTripRef,
      optimisticTrip,
      pendingCountRef: pendingReorderCountRef,
      queueRef: reorderQueueRef,
      reorderGenerationRef,
      rowsByGroupId: rowsByDate,
      timeUpdates,
    })
  }

  async function handleSpreadsheetDrop(event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    event.stopPropagation()

    const selectedDropTarget = dropTargetRef.current
    const draggedItemKey = draggedItem ? getDraggedItemKey(draggedItem) : event.dataTransfer.getData("text/plain")
    setDraggedItem(null)
    setDropTarget(null)

    if (!draggedItemKey || !selectedDropTarget) {
      return
    }

    const { dayDate: targetDate, index: rawTargetIndex } = selectedDropTarget
    const currentTrip = latestTripRef.current
    const sourceDate =
      draggedItem?.dayDate ??
      currentTrip.days.find((day) =>
        getItineraryRows(currentTrip, day.date).some(
          (row) => getItineraryRowKey(row) === draggedItemKey,
        ),
      )?.date
    const sourceRows = sourceDate ? getItineraryRows(currentTrip, sourceDate) : []
    const sourceIndex = sourceRows.findIndex((row) => getItineraryRowKey(row) === draggedItemKey)
    const targetRows = getItineraryRows(currentTrip, targetDate)

    if (!sourceDate || sourceIndex < 0) {
      return
    }

    const reorderResult = calculateSpreadsheetReorder({
      draggedKey: draggedItemKey,
      sourceGroupId: sourceDate,
      sourceRows,
      targetGroupId: targetDate,
      targetIndex: rawTargetIndex,
      targetRows,
    })
    if (!reorderResult) {
      return
    }
    if ("error" in reorderResult) {
      setReorderError(t("spreadsheet.reorderTimeRangeError"))
      return
    }

    const optimisticTrip = getOptimisticReorderedTrip(
      currentTrip,
      reorderResult.rowsByGroupId,
      reorderResult.timeUpdates,
    )
    setReorderError(null)
    latestTripRef.current = optimisticTrip
    queueReorder(optimisticTrip, reorderResult.rowsByGroupId, reorderResult.timeUpdates)
    onTripUpdated(optimisticTrip)
  }

  function handleSpreadsheetDayDragOver(event: DragEvent<HTMLTableRowElement>, dayDate: string) {
    handleSpreadsheetDragOver(event, dayDate)
  }

  async function handleSpreadsheetDayDrop(event: DragEvent<HTMLTableRowElement>) {
    await handleSpreadsheetDrop(event)
  }

  function startEditing(type: ItineraryRow["type"], item: Activity | Meal, field: EditableField) {
    setEditingFieldKey(`${type}:${item.id}:${field}`)
    setDraft(getSpreadsheetItemDraft(item))
    setSaveError(null)
  }

  function cancelEditing() {
    if (isSaving) {
      return
    }

    setEditingFieldKey(null)
    setDraft(null)
    setSaveError(null)
  }

  function startHousingEditing(stay: HousingStay, field: HousingEditableField) {
    if (isSaving) {
      return
    }

    setHousingEditingKey(`${stay.id}:${field}`)
    setHousingDraft(getHousingDraft(stay))
    setSaveError(null)
  }

  function cancelHousingEditing() {
    if (isSaving) {
      return
    }

    setHousingEditingKey(null)
    setHousingDraft(null)
    setSaveError(null)
  }

  function startCreatingHousing(dayDate: string) {
    if (isSaving) {
      return
    }

    setCreatingHousingDayDate(dayDate)
    setHousingCreateDraft({
      checkIn: dayDate,
      checkOut: shiftDate(dayDate, 1),
      googleMapsUrl: "",
      name: "",
      notes: "",
      priceAmount: "",
      priceCurrency: "",
      website: "",
    })
    setSaveError(null)
  }

  function cancelCreatingHousing() {
    if (isSaving) {
      return
    }

    setCreatingHousingDayDate(null)
    setHousingCreateDraft(null)
    setSaveError(null)
  }

  async function saveCreatingHousing() {
    if (!housingCreateDraft || !creatingHousingDayDate) {
      return
    }

    const name = housingCreateDraft.name.trim()
    const normalizedGoogleMapsUrl = housingCreateDraft.googleMapsUrl.trim()
    const normalizedAmount = housingCreateDraft.priceAmount.trim()

    if (!name && !normalizedGoogleMapsUrl) {
      setSaveError(t("spreadsheet.housingNameRequired"))
      return
    }

    if (normalizedGoogleMapsUrl && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)) {
      setSaveError(t("errors.googleMapsInvalid"))
      return
    }

    if (
      !housingCreateDraft.checkIn ||
      !housingCreateDraft.checkOut ||
      housingCreateDraft.checkOut <= housingCreateDraft.checkIn
    ) {
      setSaveError(t("spreadsheet.housingDateRangeInvalid"))
      return
    }

    if (normalizedAmount) {
      const parsedAmount = Number(normalizedAmount)
      const decimalPlaces = normalizedAmount.split(".")[1]?.length ?? 0

      if (
        !Number.isFinite(parsedAmount) ||
        parsedAmount < 0 ||
        decimalPlaces > 2 ||
        !/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)
      ) {
        setSaveError(t("itemDetails.priceInvalid"))
        return
      }

      if (!housingCreateDraft.priceCurrency) {
        setSaveError(t("itemDetails.priceCurrencyRequired"))
        return
      }
    }

    if (!normalizedAmount && housingCreateDraft.priceCurrency) {
      setSaveError(t("itemDetails.priceAmountRequired"))
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const createdStay = await createHousingStay(accessToken, trip.id, {
        checkIn: housingCreateDraft.checkIn,
        checkOut: housingCreateDraft.checkOut,
        googleMapsUrl: normalizedGoogleMapsUrl || null,
        isBackup: false,
        name,
        notes: housingCreateDraft.notes.trim() || null,
        placeAddress: null,
        placeName: null,
        latitude: null,
        longitude: null,
        priceAmount: normalizedAmount ? Number(normalizedAmount) : null,
        priceCurrency: normalizedAmount ? housingCreateDraft.priceCurrency : null,
        website: housingCreateDraft.website.trim() || null,
      })
      onTripUpdated({ ...trip, housingStays: [...trip.housingStays, createdStay] })
      setCreatingHousingDayDate(null)
      setHousingCreateDraft(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveHousingEditingField(stay: HousingStay, field: HousingEditableField) {
    if (!housingDraft || housingEditingKey !== `${stay.id}:${field}`) {
      return
    }

    const name = housingDraft.name.trim()
    const normalizedAmount = housingDraft.priceAmount.trim()
    const normalizedWebsite = housingDraft.website.trim()

    if (field === "name" && !name) {
      setSaveError(t("spreadsheet.housingNameRequired"))
      return
    }

    if (field === "price") {
      if (!normalizedAmount && housingDraft.priceCurrency) {
        setSaveError(t("itemDetails.priceAmountRequired"))
        return
      }

      if (normalizedAmount) {
        const parsedAmount = Number(normalizedAmount)
        const decimalPlaces = normalizedAmount.split(".")[1]?.length ?? 0

        if (
          !Number.isFinite(parsedAmount) ||
          parsedAmount < 0 ||
          decimalPlaces > 2 ||
          !/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount)
        ) {
          setSaveError(t("itemDetails.priceInvalid"))
          return
        }

        if (!housingDraft.priceCurrency) {
          setSaveError(t("itemDetails.priceCurrencyRequired"))
          return
        }
      }
    }

    if (
      (field === "checkIn" || field === "checkOut") &&
      (!housingDraft.checkIn ||
        !housingDraft.checkOut ||
        housingDraft.checkOut <= housingDraft.checkIn)
    ) {
      setSaveError(t("spreadsheet.housingDateRangeInvalid"))
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const updatedStay = await updateHousingStay(accessToken, trip.id, stay.id, {
        ...(field === "name" ? { name } : {}),
        ...(field === "notes" ? { notes: housingDraft.notes.trim() || null } : {}),
        ...(field === "price"
          ? {
              priceAmount: normalizedAmount ? Number(normalizedAmount) : null,
              priceCurrency: normalizedAmount ? housingDraft.priceCurrency : null,
            }
          : {}),
        ...(field === "website" ? { website: normalizedWebsite || null } : {}),
        ...(field === "checkIn" || field === "checkOut"
          ? {
              checkIn: housingDraft.checkIn,
              checkOut: housingDraft.checkOut,
            }
          : {}),
      })
      onTripUpdated(replaceHousingStayInTrip(trip, updatedStay))
      setHousingEditingKey(null)
      setHousingDraft(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmHousingDeletion(stay: HousingStay) {
    setIsSaving(true)
    setSaveError(null)

    try {
      await deleteHousingStay(accessToken, trip.id, stay.id)
      onTripUpdated({
        ...trip,
        housingStays: trip.housingStays.filter((current) => current.id !== stay.id),
      })
      setPendingDeletion(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveEditingField(
    type: ItineraryRow["type"],
    item: Activity | Meal,
    field: EditableField,
    nextDraft?: ItemDraft,
  ) {
    if (editingFieldKey !== `${type}:${item.id}:${field}`) {
      return
    }
    const currentDraft = nextDraft ?? draft
    if (!currentDraft) {
      return
    }

    setSaveError(null)
    let resolvedDraft = currentDraft

    const input =
      field === "title"
        ? { title: currentDraft.title.trim() || null }
        : field === "notes"
          ? { notes: currentDraft.notes.trim() || null }
          : {
              allDay: currentDraft.allDay,
              endTime: currentDraft.allDay ? null : currentDraft.endTime || null,
              startTime: currentDraft.allDay ? null : currentDraft.startTime || null,
            }

    if (field === "startTime" || field === "endTime") {
      const rowKey = `${type}:${item.id}`
      let editedRows: ItineraryRow[] | null = null
      const dayDate =
        item.tripDate ??
        trip.days.find((day) => getItineraryRows(trip, day.date).some((row) => getItineraryRowKey(row) === rowKey))
          ?.date
      if (dayDate) {
        const dayRows = getItineraryRows(trip, dayDate)
        if (field === "startTime") {
          resolvedDraft = applyDefaultEndTimeForStartEdit(dayRows, rowKey, resolvedDraft)
        }
        editedRows = getRowsForTimeEdit(dayRows, rowKey, resolvedDraft)

        const timeOrderError = getTimeOrderValidationError(dayRows, rowKey, resolvedDraft)
        if (timeOrderError) {
          addToast(t(timeOrderError))
          setEditingFieldKey(null)
          setDraft(null)
          return
        }
      }

      setIsSaving(true)
      if (!dayDate || !editedRows) {
        setIsSaving(false)
        return
      }

      const optimisticItem = {
        ...item,
        allDay: resolvedDraft.allDay,
        endTime: resolvedDraft.allDay ? null : resolvedDraft.endTime || null,
        startTime: resolvedDraft.allDay ? null : resolvedDraft.startTime || null,
      }
      const optimisticRows = editedRows.map((row) =>
        getItineraryRowKey(row) === rowKey ? { ...row, item: optimisticItem } : row,
      )
      const optimisticTrip = getOptimisticReorderedTrip(
        trip,
        new Map([[dayDate, optimisticRows]]),
        new Map(),
      )

      onTripUpdated(optimisticTrip)
      setEditingFieldKey(null)
      setDraft(null)

      try {
        await Promise.all(
          optimisticRows.map((row, sortOrder) => {
            const baseInput = {
              sortOrder,
            }
            if (getItineraryRowKey(row) !== rowKey) {
              return row.type === "meal"
                ? updateMeal(accessToken, trip.id, row.item.id, baseInput)
                : updateActivity(accessToken, trip.id, row.item.id, baseInput)
            }

            const editedInput = {
              ...baseInput,
              allDay: resolvedDraft.allDay,
              endTime: resolvedDraft.allDay ? null : resolvedDraft.endTime || null,
              startTime: resolvedDraft.allDay ? null : resolvedDraft.startTime || null,
            }
            return row.type === "meal"
              ? updateMeal(accessToken, trip.id, row.item.id, editedInput)
              : updateActivity(accessToken, trip.id, row.item.id, editedInput)
          }),
        )
      } catch (reason: unknown) {
        const message = getErrorMessage(reason)
        onTripUpdated(trip)
        addToast(message)
        window.setTimeout(() => {
          setEditingFieldKey(`${type}:${item.id}:${field}`)
          setDraft(resolvedDraft)
        }, 0)
      } finally {
        setIsSaving(false)
      }

      return
    }

    setIsSaving(true)
    try {
      if (type === "meal") {
        const savedMeal = await updateMeal(accessToken, trip.id, item.id, input)
        onTripUpdated(replaceMealInTrip(trip, savedMeal))
      } else {
        const savedActivity = await updateActivity(accessToken, trip.id, item.id, input)
        onTripUpdated(replaceActivityInTrip(trip, savedActivity))
      }

      setEditingFieldKey(null)
      setDraft(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-border-card bg-surface-soft p-4 lg:hidden">
        <p className="font-semibold text-brand">{t("spreadsheet.desktopOnlyTitle")}</p>
        <p className="mt-2 text-sm text-muted">{t("spreadsheet.desktopOnlyDescription")}</p>
      </div>

      <div className="hidden lg:block">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-text">
              {t("spreadsheet.prototype")}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-brand">{t("spreadsheet.itinerary")}</h2>
            <p className="mt-2 text-sm text-muted">{t("spreadsheet.readOnlyDescription")}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted">
              {t("spreadsheet.tripDates", {
                start: formatDate(trip.startDate),
                end: formatDate(trip.endDate),
              })}
            </p>
            <button
              aria-expanded={showSettings}
              aria-label={t("tripDetails.settings")}
              className="grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted transition hover:border-brand hover:text-brand"
              onClick={() => setShowSettings((current) => !current)}
              type="button"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
        {showSettings && (
          <TripSettings
            accessToken={accessToken}
            onClose={() => setShowSettings(false)}
            onDelete={onTripDeleted}
            onSaved={onTripUpdated}
            trip={trip}
          />
        )}
        <div className="relative mt-5 w-full overflow-x-auto">
          <div className="w-full min-w-0 rounded-2xl border border-border-card bg-surface">
            <table
              className="w-full min-w-[64rem] table-fixed border-collapse text-left"
              ref={tableRef}
            >
              <colgroup>
                <col className="w-64" />
                <col className="w-30" />
                <col className="w-56" />
                <col className="w-16" />
                <col className="w-16" />
                {showPrice && (
                  <>
                    <col className="w-16" />
                    <col className="w-16" />
                  </>
                )}
                {showWebsite && <col className="w-32" />}
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <SpreadsheetHeaderCell>{t("spreadsheet.housing")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.date")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.title")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.start")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.end")}</SpreadsheetHeaderCell>
                  {showPrice && (
                    <>
                      <SpreadsheetHeaderCell>{t("spreadsheet.price")}</SpreadsheetHeaderCell>
                      <SpreadsheetHeaderCell>{t("spreadsheet.currency")}</SpreadsheetHeaderCell>
                    </>
                  )}
                  {showWebsite && (
                    <SpreadsheetHeaderCell>{t("spreadsheet.website")}</SpreadsheetHeaderCell>
                  )}
                  <SpreadsheetHeaderCell className="w-full">{null}</SpreadsheetHeaderCell>
                </tr>
              </thead>
              <tbody>
                {itineraryRows.map(({ day, rows }, dayIndex) => {
                  const housing = housingByDay[dayIndex]
                  const housingId = housing?.id ?? null
                  const previousHousingId = housingByDay[dayIndex - 1]?.id ?? null
                  const startsHousingBlock =
                    !housing || dayIndex === 0 || housingId !== previousHousingId
                  const activeHousingField = housing
                    ? (housingEditableFields.find(
                        (field) => housingEditingKey === `${housing.id}:${field}`,
                      ) ?? null)
                    : null

                  return (
                    <Fragment key={day.date}>
                      <tr
                        className="bg-page"
                        onDragOver={(event) => handleSpreadsheetDayDragOver(event, day.date)}
                        onDrop={(event) => void handleSpreadsheetDayDrop(event)}
                      >
                        {startsHousingBlock && (
                          <td
                            className="border-b border-r border-border-divider bg-surface-soft p-3 align-top"
                            rowSpan={getHousingRowSpan(dayIndex)}
                          >
                            <SpreadsheetHousingContent
                              housing={housing}
                              activeHousingField={activeHousingField}
                              housingDraft={housingDraft}
                              housingCreateDraft={housingCreateDraft}
                              creatingForDay={creatingHousingDayDate === day.date}
                              isSaving={isSaving}
                              saveError={saveError}
                              showPrice={showPrice}
                              showWebsite={showWebsite}
                              currencies={currencies}
                              locale={locale}
                              onDeleteHousing={() => setPendingDeletion({ housing: housing! })}
                              onStartEditing={(field) => startHousingEditing(housing!, field)}
                              onUpdateDraft={setHousingDraft}
                              onSaveField={(field) => void saveHousingEditingField(housing!, field)}
                              onCancelEditing={cancelHousingEditing}
                              onUpdateCreateDraft={setHousingCreateDraft}
                              onSaveCreate={() => void saveCreatingHousing()}
                              onCancelCreate={cancelCreatingHousing}
                              onStartCreating={() => startCreatingHousing(day.date)}
                            />
                          </td>
                        )}
                        <th
                          className="border-y border-border-divider px-3 py-2 text-left text-sm font-semibold text-brand"
                          colSpan={itineraryColumnCount}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {editingDayTitleDate === day.date ? (
                              <form
                                className="flex min-w-0 flex-1 flex-wrap items-center gap-0"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  void saveDayTitle(day.date)
                                }}
                              >
                                <span className="w-30 shrink-0 text-brand">
                                  {formatDate(day.date)}
                                </span>
                                <input
                                  aria-label={t("tripDetails.dayTitle")}
                                  autoFocus
                                  className="w-56 shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-normal text-on-surface outline-none focus:border-brand"
                                  disabled={isSavingDayTitle}
                                  maxLength={200}
                                  onChange={(event) => setDayTitleDraft(event.target.value)}
                                  placeholder={t("tripDetails.dayTitlePlaceholder")}
                                  type="text"
                                  value={dayTitleDraft}
                                />
                                <span className="ml-2 flex gap-2">
                                  <button
                                    className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
                                    disabled={isSavingDayTitle}
                                    type="submit"
                                  >
                                    {isSavingDayTitle ? t("common.saving") : t("common.save")}
                                  </button>
                                  <button
                                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted hover:text-on-surface disabled:opacity-50"
                                    disabled={isSavingDayTitle}
                                    onClick={cancelEditingDayTitle}
                                    type="button"
                                  >
                                    {t("common.cancel")}
                                  </button>
                                </span>
                                {dayTitleError && (
                                  <p className="basis-full text-xs font-normal text-error">
                                    {dayTitleError}
                                  </p>
                                )}
                              </form>
                            ) : (
                              <div className="flex min-w-0 flex-1 items-baseline gap-1">
                                <span className="w-29 shrink-0 text-brand">
                                  {formatDate(day.date)}
                                </span>
                                <button
                                  className={`w-56 min-w-0 shrink-0 break-words text-left !text-lg font-semibold ${
                                    day.title?.trim()
                                      ? "text-on-surface hover:text-brand"
                                      : "text-muted hover:text-brand"
                                  }`}
                                  onClick={() => startEditingDayTitle(day)}
                                  type="button"
                                >
                                  {day.title?.trim() || t("tripDetails.dayTitle")}
                                </button>
                              </div>
                            )}
                            <span className="flex flex-wrap gap-2 normal-case tracking-normal">
                              <button
                                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() => startCreatingItem(day.date, "activity")}
                                type="button"
                              >
                                + {t("spreadsheet.addActivity")}
                              </button>
                              <button
                                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() => startCreatingItem(day.date, "meal")}
                                type="button"
                              >
                                + {t("spreadsheet.addMeal")}
                              </button>
                            </span>
                          </div>
                        </th>
                      </tr>
                      {creatingDayDate === day.date && (
                        <tr>
                          <td
                            className="border-b border-border-divider p-3"
                            colSpan={itineraryColumnCount}
                          >
                            {renderCreateItemForm(day.date)}
                          </td>
                        </tr>
                      )}
                      {rows.length === 0 ? (
                        <tr
                          data-drop-empty-day={day.date}
                          onDragOver={(event) => handleSpreadsheetDayDragOver(event, day.date)}
                          onDrop={(event) => void handleSpreadsheetDayDrop(event)}
                        >
                          <td
                            className="border-b border-border-divider px-3 py-2 text-sm text-muted"
                            colSpan={itineraryColumnCount}
                          >
                            {t("spreadsheet.noItems")}
                          </td>
                        </tr>
                      ) : (
                        rows.map(({ item, type }, itemIndex) => {
                          const itemKey = `${type}:${item.id}`
                          const activeField = editingFieldKey?.startsWith(`${itemKey}:`)
                            ? (editingFieldKey.slice(itemKey.length + 1) as EditableField)
                            : null
                          return (
                            <SpreadsheetItineraryRow
                              key={itemKey}
                              item={item}
                              type={type}
                              dayDate={day.date}
                              itemIndex={itemIndex}
                              draft={draft}
                              activeField={activeField}
                              isSaving={isSaving}
                              saveError={saveError}
                              showPrice={showPrice}
                              showWebsite={showWebsite}
                              isHousingEditing={!!housingEditingKey}
                              savingPreferenceKey={savingPreferenceKey}
                              userId={userId}
                              preferences={trip.preferences}
                              itineraryColumnCount={itineraryColumnCount}
                              onStartEditing={startEditing}
                              onUpdateDraft={setDraft}
                              onSaveField={(type, item, field, nextDraft) =>
                                void saveEditingField(type, item, field, nextDraft)
                              }
                              onCancelEditing={cancelEditing}
                              onSetPendingDeletion={(deletion) => setPendingDeletion(deletion)}
                              onSaveGoogleMapsUrl={saveItemGoogleMapsUrl}
                              onMoveToBackup={moveItemToBackup}
                              onOpenMap={onOpenMap}
                              onPreferenceChange={(itemType, itemId, value) =>
                                void handlePreferenceChange(itemType, itemId, value)
                              }
                              onDragStart={handleSpreadsheetDragStart}
                              onDragOver={handleSpreadsheetDragOver}
                              onDragEnd={handleSpreadsheetDragEnd}
                              onDrop={handleSpreadsheetDrop}
                            />
                          )
                        })
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {dropLineBounds &&
              dropTarget &&
              draggedItem &&
              !isDropLineSuppressed &&
              createPortal(
                <div
                  aria-hidden="true"
                  className="pointer-events-none fixed z-30 h-0.5 bg-brand shadow-sm"
                  data-drop-indicator
                  style={{
                    left: dropLineBounds.left,
                    top: dropTarget.lineY - 1,
                    width: dropLineBounds.width,
                  }}
                />,
                document.body,
              )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        isConfirming={isSaving}
        isOpen={pendingDeletion !== null}
        message={
          pendingDeletion
            ? "housing" in pendingDeletion
              ? t("tripDetails.deleteHousingConfirmation", {
                  name: pendingDeletion.housing.name,
                })
              : pendingDeletion.type === "activity"
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
        onConfirm={() => void confirmPendingDeletion()}
        title={t("common.confirmDeletionTitle")}
      />
    </section>
  )
}
