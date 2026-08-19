import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  updateActivity,
  getTrip,
  updateHousingStay,
  updateMeal,
  reorderDayItems,
  type Activity,
  type HousingStay,
  type Meal,
  type ReorderDayItemInput,
  type TripDetail,
} from "../../api"
import { DatePicker } from "../../components/DatePicker"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { SettingsIcon } from "../../components/SettingsIcon"
import { TimePicker } from "../../components/TimePicker"
import { getDateLocale } from "../../i18n"
import { getDayItemTitle, sortDayItems } from "../../lib/activity-format"
import { getDefaultCurrency } from "../../lib/currency"
import { formatLongDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import {
  replaceActivityInTrip,
  replaceHousingStayInTrip,
  replaceMealInTrip,
} from "./trip-state"
import { TripSettings } from "./TripSettings"

type TripSpreadsheetPageProps = {
  accessToken: string
  onTripDeleted: (trip: TripDetail) => Promise<void>
  onTripUpdated: (trip: TripDetail) => void
  trip: TripDetail
  showDetails: boolean
}

type HousingDraft = {
  checkIn: string
  checkOut: string
  name: string
  notes: string
  priceAmount: string
  priceCurrency: string
  website: string
}

function getHousingDraft(stay: HousingStay): HousingDraft {
  return {
    checkIn: stay.checkIn ?? "",
    checkOut: stay.checkOut ?? "",
    name: stay.name,
    notes: stay.notes ?? "",
    priceAmount: stay.priceAmount === null ? "" : String(stay.priceAmount),
    priceCurrency: stay.priceCurrency ?? "",
    website: stay.website ?? "",
  }
}

function formatHousingPrice(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amount)
}

type ItineraryRow = {
  item: Activity | Meal
  type: "activity" | "meal"
}

type SpreadsheetDropTarget = {
  dayDate: string
  index: number
}

type SpreadsheetDraggedItem = {
  dayDate: string
  itemId: string
  itemType: ItineraryRow["type"]
}

type ItemDraft = {
  allDay: boolean
  endTime: string
  notes: string
  startTime: string
  title: string
}

type EditableField = "endTime" | "notes" | "startTime" | "title"
type HousingEditableField = "checkIn" | "checkOut" | "name" | "notes" | "price" | "website"
const housingEditableFields: HousingEditableField[] = [
  "name",
  "checkIn",
  "checkOut",
  "notes",
  "price",
  "website",
]

function getItemDraft(item: Activity | Meal): ItemDraft {
  return {
    allDay: item.allDay,
    endTime: item.endTime ?? "",
    notes: item.notes ?? "",
    startTime: item.startTime ?? "",
    title: item.title ?? item.placeName ?? "",
  }
}

type ItemTimeUpdate = {
  endTime: string | null
  startTime: string | null
}

function getTimeMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function formatTimeMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function getTimeAnchor(item: Activity | Meal) {
  if (item.allDay) {
    return null
  }

  return item.startTime ?? item.endTime
}

function rebaseItemTime(item: Activity | Meal, startTime: string): ItemTimeUpdate | null {
  if (!getTimeAnchor(item)) {
    return null
  }

  if (!item.startTime) {
    return {
      endTime: startTime,
      startTime: null,
    }
  }

  if (!item.endTime) {
    return {
      endTime: null,
      startTime,
    }
  }

  const duration = getTimeMinutes(item.endTime) - getTimeMinutes(item.startTime)
  const endMinutes = getTimeMinutes(startTime) + duration

  if (endMinutes > 23 * 60 + 59) {
    return null
  }

  return {
    endTime: formatTimeMinutes(endMinutes),
    startTime,
  }
}

function getItineraryRowKey(row: ItineraryRow) {
  return `${row.type}:${row.item.id}`
}

function getDropIndex(event: DragEvent<HTMLTableRowElement>, itemIndex: number) {
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientY >= bounds.top + bounds.height / 2 ? itemIndex + 1 : itemIndex
}

function isDragBlockedTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    Boolean(target.closest("button, input, select, textarea, [contenteditable='true']"))
}

function getItineraryRows(trip: TripDetail, date: string): ItineraryRow[] {
  const day = trip.days.find((currentDay) => currentDay.date === date)
  const meals = trip.meals.filter((meal) => !meal.isBackup && meal.tripDate === date)
  const activityIds = new Set(day?.activities.map((activity) => activity.id))

  return sortDayItems([...(day?.activities ?? []), ...meals]).map((item) => ({
    item,
    type: activityIds.has(item.id) ? "activity" : "meal",
  }))
}

function SpreadsheetCell({ children }: { children: ReactNode }) {
  return <td className="border-b border-border-divider px-3 py-2 align-top text-sm">{children}</td>
}

function SpreadsheetHeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-border-divider bg-surface-muted px-3 py-2 first:rounded-tl-2xl last:rounded-tr-2xl">
      {children}
    </th>
  )
}

function LinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href || !isAllowedGoogleMapsUrl(href)) {
    return <SpreadsheetCell>{null}</SpreadsheetCell>
  }

  return (
    <SpreadsheetCell>
      <GoogleMapsLinkButton href={href} label={label} />
    </SpreadsheetCell>
  )
}

export function TripSpreadsheetPage({
  accessToken,
  onTripDeleted,
  onTripUpdated,
  trip,
  showDetails,
}: TripSpreadsheetPageProps) {
  const { i18n, t } = useTranslation()
  const locale = getDateLocale(i18n.language)
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [housingEditingKey, setHousingEditingKey] = useState<string | null>(null)
  const [housingDraft, setHousingDraft] = useState<HousingDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [draggedItem, setDraggedItem] = useState<SpreadsheetDraggedItem | null>(null)
  const [dropTarget, setDropTarget] = useState<SpreadsheetDropTarget | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const latestTripRef = useRef(trip)
  const reorderQueueRef = useRef(Promise.resolve())
  const pendingReorderCountRef = useRef(0)
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
  const rowCounts = itineraryRows.map(({ rows }) => 1 + Math.max(rows.length, 1))
  const getHousingRowSpan = (startIndex: number) => {
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

  function getReorderInput(nextTrip: TripDetail): ReorderDayItemInput[] {
    return nextTrip.days.flatMap((day) =>
      getItineraryRows(nextTrip, day.date).map(({ item, type }, sortOrder) => ({
        itemId: item.id,
        itemType: type,
        tripDate: day.date,
        sortOrder,
        startTime: item.startTime,
        endTime: item.endTime,
      })),
    )
  }

  function getOptimisticReorderedTrip(
    baseTrip: TripDetail,
    rowsByDate: Map<string, ItineraryRow[]>,
    timeUpdates: Map<string, ItemTimeUpdate>,
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

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", getItineraryRowKey(row))
    const dragPreview = document.createElement("div")
    dragPreview.className =
      "pointer-events-none fixed z-50 rounded-lg border border-brand bg-surface px-3 py-2 text-sm font-semibold text-on-surface shadow-lg"
    dragPreview.textContent = `${row.type === "activity" ? t("spreadsheet.activity") : t("spreadsheet.meal")} · ${getDayItemTitle(
      row.item,
      t("tripDetails.untitledItem"),
    )}`
    dragPreview.style.left = "-1000px"
    dragPreview.style.top = "-1000px"
    document.body.appendChild(dragPreview)
    event.dataTransfer.setDragImage(dragPreview, 16, 16)
    window.setTimeout(() => dragPreview.remove(), 0)
    setDraggedItem({
      dayDate,
      itemId: row.item.id,
      itemType: row.type,
    })
    setReorderError(null)
  }

  function handleSpreadsheetDragOver(
    event: DragEvent<HTMLTableRowElement>,
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

  function handleSpreadsheetDragEnd() {
    setDraggedItem(null)
    setDropTarget(null)
  }

  function queueReorder(optimisticTrip: TripDetail) {
    const reorderGeneration = ++reorderGenerationRef.current
    pendingReorderCountRef.current += 1
    const queuedRequest = reorderQueueRef.current.then(() =>
      reorderDayItems(accessToken, optimisticTrip.id, getReorderInput(optimisticTrip)).then(
        () => undefined,
      ),
    )
    reorderQueueRef.current = queuedRequest.catch(() => undefined)

    void queuedRequest
      .then(() => {
        if (reorderGeneration === reorderGenerationRef.current) {
          setReorderError(null)
        }
      })
      .catch(async (reason: unknown) => {
        setReorderError(getErrorMessage(reason))

        if (
          pendingReorderCountRef.current > 1 ||
          reorderGeneration !== reorderGenerationRef.current
        ) {
          return
        }

        try {
          const refreshedTrip = await getTrip(accessToken, optimisticTrip.id)
          latestTripRef.current = refreshedTrip
          if (
            pendingReorderCountRef.current === 1 &&
            reorderGeneration === reorderGenerationRef.current
          ) {
            onTripUpdated(refreshedTrip)
          }
        } catch (refreshReason: unknown) {
          setReorderError(`${getErrorMessage(reason)} ${getErrorMessage(refreshReason)}`)
        }
      })
      .finally(() => {
        pendingReorderCountRef.current -= 1
      })
  }

  async function handleSpreadsheetDrop(
    event: DragEvent<HTMLTableRowElement>,
    targetDate: string,
    rawTargetIndex: number,
  ) {
    event.preventDefault()
    event.stopPropagation()

    const draggedItemKey = draggedItem
      ? `${draggedItem.itemType}:${draggedItem.itemId}`
      : event.dataTransfer.getData("text/plain")
    setDraggedItem(null)
    setDropTarget(null)

    if (!draggedItemKey) {
      return
    }

    const currentTrip = latestTripRef.current
    const sourceDate =
      draggedItem?.dayDate ??
      currentTrip.days.find((day) =>
        getItineraryRows(currentTrip, day.date).some(
          (row) => getItineraryRowKey(row) === draggedItemKey,
        ),
      )?.date
    const sourceRows = sourceDate ? getItineraryRows(currentTrip, sourceDate) : []
    const sourceIndex = sourceRows.findIndex(
      (row) => getItineraryRowKey(row) === draggedItemKey,
    )
    const targetRows = getItineraryRows(currentTrip, targetDate)

    if (!sourceDate || sourceIndex < 0) {
      return
    }

    const isSameDay = sourceDate === targetDate
    const targetRowsWithoutDraggedItem = targetRows.filter(
      (row) => getItineraryRowKey(row) !== draggedItemKey,
    )
    const adjustedTargetIndex =
      isSameDay && sourceIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex
    const insertionIndex = Math.max(
      0,
      Math.min(adjustedTargetIndex, targetRowsWithoutDraggedItem.length),
    )
    const movedRow = sourceRows[sourceIndex]
    const nextTargetRows = [
      ...targetRowsWithoutDraggedItem.slice(0, insertionIndex),
      movedRow,
      ...targetRowsWithoutDraggedItem.slice(insertionIndex),
    ]
    const finalIndex = insertionIndex

    if (isSameDay && finalIndex === sourceIndex) {
      return
    }

    const timeUpdates = new Map<string, ItemTimeUpdate>()

    if (isSameDay) {
      const segmentStart = Math.min(sourceIndex, finalIndex)
      const segmentEnd = Math.max(sourceIndex, finalIndex)
      const originalTimedRows = sourceRows
        .slice(segmentStart, segmentEnd + 1)
        .filter((row) => getTimeAnchor(row.item) !== null)
      const reorderedTimedRows = nextTargetRows
        .slice(segmentStart, segmentEnd + 1)
        .filter((row) => getTimeAnchor(row.item) !== null)
      const originalTimeSlots = originalTimedRows
        .map((row) => getTimeAnchor(row.item))
        .filter((time): time is string => time !== null)

      for (const [index, row] of reorderedTimedRows.entries()) {
        const timeUpdate = rebaseItemTime(row.item, originalTimeSlots[index])
        if (!timeUpdate) {
          setReorderError(t("spreadsheet.reorderTimeRangeError"))
          return
        }

        timeUpdates.set(getItineraryRowKey(row), timeUpdate)
      }
    } else {
      timeUpdates.set(getItineraryRowKey(movedRow), {
        endTime: null,
        startTime: null,
      })
    }

    const rowsByDate = new Map<string, ItineraryRow[]>()
    if (isSameDay) {
      rowsByDate.set(sourceDate, nextTargetRows)
    } else {
      rowsByDate.set(sourceDate, sourceRows.filter((row) => getItineraryRowKey(row) !== draggedItemKey))
      rowsByDate.set(targetDate, nextTargetRows)
    }

    const optimisticTrip = getOptimisticReorderedTrip(currentTrip, rowsByDate, timeUpdates)
    setReorderError(null)
    latestTripRef.current = optimisticTrip
    queueReorder(optimisticTrip)
    onTripUpdated(optimisticTrip)
  }

  function handleSpreadsheetDayDragOver(event: DragEvent<HTMLTableRowElement>, dayDate: string) {
    if (!draggedItem) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDropTarget({ dayDate, index: 0 })
  }

  async function handleSpreadsheetDayDrop(
    event: DragEvent<HTMLTableRowElement>,
    dayDate: string,
  ) {
    await handleSpreadsheetDrop(event, dayDate, 0)
  }

  function startEditing(type: ItineraryRow["type"], item: Activity | Meal, field: EditableField) {
    if (isSaving) {
      return
    }

    setEditingFieldKey(`${type}:${item.id}:${field}`)
    setDraft(getItemDraft(item))
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

  function renderHousingActions(stay: HousingStay, field: HousingEditableField) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
          disabled={isSaving}
          onClick={() => void saveHousingEditingField(stay, field)}
          type="button"
        >
          {isSaving ? t("common.saving") : t("common.save")}
        </button>
        <button
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
          disabled={isSaving}
          onClick={cancelHousingEditing}
          type="button"
        >
          {t("common.cancel")}
        </button>
        {saveError && <p className="basis-full text-xs text-error">{saveError}</p>}
      </div>
    )
  }

  async function saveEditingField(
    type: ItineraryRow["type"],
    item: Activity | Meal,
    field: EditableField,
  ) {
    if (!draft || editingFieldKey !== `${type}:${item.id}:${field}`) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    const input =
      field === "title"
        ? { title: draft.title.trim() || null }
        : field === "notes"
          ? { notes: draft.notes.trim() || null }
          : {
              allDay: draft.allDay,
              endTime: draft.allDay ? null : draft.endTime || null,
              startTime: draft.allDay ? null : draft.startTime || null,
            }

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
                start: formatLongDate(trip.startDate),
                end: formatLongDate(trip.endDate),
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
        {reorderError && <p className="mt-3 text-sm text-error">{reorderError}</p>}

        <div className="relative left-1/2 mt-5 w-screen -translate-x-1/2 px-2">
          <div className="mx-auto w-fit rounded-2xl border border-border-card bg-surface">
            <table className="mx-auto w-max min-w-[83rem] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-52" />
                <col className="w-30" />
                <col className="w-26" />
                <col className="w-48" />
                <col className="w-16" />
                <col className="w-16" />
                <col className="w-32" />
                <col className="w-48" />
                {showPrice && (
                  <>
                    <col className="w-16" />
                    <col className="w-16" />
                  </>
                )}
                {showWebsite && <col className="w-32" />}
              </colgroup>
              <thead className="sticky top-0 z-10 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <SpreadsheetHeaderCell>{t("spreadsheet.housing")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.date")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.type")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.title")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.start")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.end")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.googleMaps")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.notes")}</SpreadsheetHeaderCell>
                  {showPrice && (
                    <>
                      <SpreadsheetHeaderCell>{t("spreadsheet.price")}</SpreadsheetHeaderCell>
                      <SpreadsheetHeaderCell>{t("spreadsheet.currency")}</SpreadsheetHeaderCell>
                    </>
                  )}
                  {showWebsite && (
                    <SpreadsheetHeaderCell>{t("spreadsheet.website")}</SpreadsheetHeaderCell>
                  )}
                </tr>
              </thead>
              <tbody>
                {itineraryRows.map(({ day, rows }, dayIndex) => {
                  const housing = housingByDay[dayIndex]
                  const housingId = housing?.id ?? null
                  const previousHousingId = housingByDay[dayIndex - 1]?.id ?? null
                  const startsHousingBlock = dayIndex === 0 || housingId !== previousHousingId
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
                        onDrop={(event) => void handleSpreadsheetDayDrop(event, day.date)}
                      >
                        {startsHousingBlock && (
                          <td
                            className="border-b border-r border-border-divider bg-surface-soft p-3 align-top"
                            rowSpan={getHousingRowSpan(dayIndex)}
                          >
                            {housing ? (
                              <div className="space-y-2">
                                {activeHousingField === "name" && housingDraft ? (
                                  <>
                                    <input
                                      aria-label={t("tripDetails.housingName")}
                                      autoFocus
                                      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setHousingDraft((current) =>
                                          current ? { ...current, name: event.target.value } : current,
                                        )
                                      }
                                      value={housingDraft.name}
                                    />
                                    {renderHousingActions(housing, "name")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left font-semibold leading-tight text-brand transition hover:text-brand"
                                    onClick={() => startHousingEditing(housing, "name")}
                                    type="button"
                                  >
                                    {housing.name}
                                  </button>
                                )}
                                {activeHousingField === "checkIn" && housingDraft ? (
                                  <>
                                    <DatePicker
                                      label={t("tripDetails.checkIn")}
                                      onChange={(value) =>
                                        setHousingDraft((current) =>
                                          current ? { ...current, checkIn: value } : current,
                                        )
                                      }
                                      value={housingDraft.checkIn}
                                    />
                                    {renderHousingActions(housing, "checkIn")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left text-xs text-muted transition hover:text-brand"
                                    onClick={() => startHousingEditing(housing, "checkIn")}
                                    type="button"
                                  >
                                    {housing.checkIn
                                      ? formatLongDate(housing.checkIn)
                                      : t("tripDetails.checkIn")}
                                  </button>
                                )}
                                {activeHousingField === "checkOut" && housingDraft ? (
                                  <>
                                    <DatePicker
                                      label={t("tripDetails.checkOut")}
                                      onChange={(value) =>
                                        setHousingDraft((current) =>
                                          current ? { ...current, checkOut: value } : current,
                                        )
                                      }
                                      value={housingDraft.checkOut}
                                    />
                                    {renderHousingActions(housing, "checkOut")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left text-xs text-muted transition hover:text-brand"
                                    onClick={() => startHousingEditing(housing, "checkOut")}
                                    type="button"
                                  >
                                    {housing.checkOut
                                      ? formatLongDate(housing.checkOut)
                                      : t("tripDetails.checkOut")}
                                  </button>
                                )}
                                {activeHousingField === "notes" && housingDraft ? (
                                  <>
                                    <textarea
                                      aria-label={t("tripDetails.notes")}
                                      autoFocus
                                      className="min-h-20 resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setHousingDraft((current) =>
                                          current ? { ...current, notes: event.target.value } : current,
                                        )
                                      }
                                      value={housingDraft.notes}
                                    />
                                    {renderHousingActions(housing, "notes")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text whitespace-pre-wrap text-left text-sm text-muted transition hover:text-brand"
                                    onClick={() => startHousingEditing(housing, "notes")}
                                    type="button"
                                  >
                                    {housing.notes?.trim() || t("tripDetails.notes")}
                                  </button>
                                )}
                                {housing.googleMapsUrl &&
                                  isAllowedGoogleMapsUrl(housing.googleMapsUrl) && (
                                    <GoogleMapsLinkButton
                                      href={housing.googleMapsUrl}
                                      label={t("tripDetails.openGoogleMaps")}
                                    />
                                  )}
                                {showPrice && (
                                  <div className="mt-2 grid gap-1 text-sm text-muted">
                                    {activeHousingField === "price" && housingDraft ? (
                                      <>
                                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                                          <label className="grid gap-1 text-xs font-medium">
                                            {t("itemDetails.price")}
                                            <input
                                              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                              inputMode="decimal"
                                              min="0"
                                              onChange={(event) =>
                                                setHousingDraft((current) =>
                                                  current
                                                    ? { ...current, priceAmount: event.target.value }
                                                    : current,
                                                )
                                              }
                                              step="0.01"
                                              type="number"
                                              value={housingDraft.priceAmount}
                                            />
                                          </label>
                                          <label className="grid gap-1 text-xs font-medium">
                                            {t("itemDetails.currency")}
                                            <select
                                              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                              onChange={(event) =>
                                                setHousingDraft((current) =>
                                                  current
                                                    ? {
                                                        ...current,
                                                        priceCurrency: event.target.value,
                                                      }
                                                    : current,
                                                )
                                              }
                                              value={housingDraft.priceCurrency}
                                            >
                                              <option value="">{t("itemDetails.noCurrency")}</option>
                                              {housingDraft.priceCurrency &&
                                                !currencies.includes(housingDraft.priceCurrency) && (
                                                  <option value={housingDraft.priceCurrency}>
                                                    {housingDraft.priceCurrency}
                                                  </option>
                                                )}
                                              {currencies.map((currency) => (
                                                <option key={currency} value={currency}>
                                                  {currency}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>
                                        {renderHousingActions(housing, "price")}
                                      </>
                                    ) : (
                                      <button
                                        className="w-full cursor-text text-left transition hover:text-brand"
                                        onClick={() => startHousingEditing(housing, "price")}
                                        type="button"
                                      >
                                        <span className="font-semibold text-on-surface">
                                          {t("itemDetails.price")}:
                                        </span>{" "}
                                        {housing.priceAmount !== null && housing.priceCurrency
                                          ? formatHousingPrice(
                                              housing.priceAmount,
                                              housing.priceCurrency,
                                              locale,
                                            )
                                          : t("itemDetails.notSet")}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {showWebsite && (
                                  <div className="mt-1 text-sm text-muted">
                                    {activeHousingField === "website" && housingDraft ? (
                                      <>
                                        <label className="grid gap-1 text-xs font-medium">
                                          {t("itemDetails.website")}
                                          <input
                                            autoFocus
                                            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                            maxLength={2000}
                                            onChange={(event) =>
                                              setHousingDraft((current) =>
                                                current
                                                  ? { ...current, website: event.target.value }
                                                  : current,
                                              )
                                            }
                                            placeholder={t("itemDetails.websitePlaceholder")}
                                            type="text"
                                            value={housingDraft.website}
                                          />
                                        </label>
                                        {renderHousingActions(housing, "website")}
                                      </>
                                    ) : (
                                      <button
                                        className="w-full cursor-text break-all text-left transition hover:text-brand"
                                        onClick={() => startHousingEditing(housing, "website")}
                                        type="button"
                                      >
                                        <span className="font-semibold text-on-surface">
                                          {t("itemDetails.website")}:
                                        </span>{" "}
                                        {housing.website?.trim() || t("itemDetails.notSet")}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted">
                                {t("spreadsheet.noHousing")}
                              </span>
                            )}
                          </td>
                        )}
                        <th
                          className="border-y border-border-divider px-3 py-2 text-left text-sm font-semibold text-brand"
                          colSpan={itineraryColumnCount}
                        >
                          {formatLongDate(day.date)}
                          {day.title?.trim() ? ` · ${day.title}` : ""}
                        </th>
                      </tr>
                      {rows.length === 0 ? (
                        <tr
                          className={
                            dropTarget?.dayDate === day.date && dropTarget.index === 0
                              ? "border-y-4 border-brand bg-surface-muted"
                              : ""
                          }
                          onDragOver={(event) => handleSpreadsheetDayDragOver(event, day.date)}
                          onDrop={(event) => void handleSpreadsheetDayDrop(event, day.date)}
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
                          const isDropBefore =
                            dropTarget?.dayDate === day.date && dropTarget.index === itemIndex
                          const isDropAfter =
                            dropTarget?.dayDate === day.date && dropTarget.index === itemIndex + 1
                          const renderActions = (field: EditableField) => (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() => void saveEditingField(type, item, field)}
                                type="button"
                              >
                                {isSaving ? t("common.saving") : t("common.save")}
                              </button>
                              <button
                                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
                                disabled={isSaving}
                                onClick={cancelEditing}
                                type="button"
                              >
                                {t("common.cancel")}
                              </button>
                              {saveError && (
                                <p className="basis-full text-xs text-error">{saveError}</p>
                              )}
                            </div>
                          )

                          return (
                            <tr
                              className={`hover:bg-surface-soft ${
                                isDropBefore
                                  ? "border-t-4 border-brand bg-surface-muted"
                                  : ""
                              } ${
                                isDropAfter
                                  ? "border-b-4 border-brand bg-surface-muted"
                                  : ""
                              }`}
                              draggable
                              key={itemKey}
                              onDragOver={(event) =>
                                handleSpreadsheetDragOver(event, day.date, itemIndex)
                              }
                              onDragEnd={handleSpreadsheetDragEnd}
                              onDragStart={(event) =>
                                handleSpreadsheetDragStart(event, day.date, {
                                  item,
                                  type,
                                })
                              }
                              onDrop={(event) =>
                                void handleSpreadsheetDrop(
                                  event,
                                  day.date,
                                  getDropIndex(event, itemIndex),
                                )
                              }
                            >
                              <SpreadsheetCell>
                                {formatLongDate(item.tripDate ?? day.date)}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                <span className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-2">
                                    <span
                                      aria-hidden="true"
                                      className={`size-2.5 rounded-full ${
                                        type === "activity" ? "bg-type-activity" : "bg-type-meal"
                                      }`}
                                    />
                                    {type === "activity"
                                      ? t("spreadsheet.activity")
                                      : t("spreadsheet.meal")}
                                  </span>
                                </span>
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "title" && draft ? (
                                  <>
                                    <input
                                      aria-label={t("spreadsheet.title")}
                                      autoFocus
                                      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setDraft((current) =>
                                          current
                                            ? { ...current, title: event.target.value }
                                            : current,
                                        )
                                      }
                                      value={draft.title}
                                    />
                                    {renderActions("title")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "title")}
                                    type="button"
                                  >
                                    {getDayItemTitle(item, t("tripDetails.untitledItem"))}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "startTime" && draft ? (
                                  <>
                                    <label className="flex items-center gap-1 text-xs text-muted">
                                      <input
                                        checked={draft.allDay}
                                        onChange={(event) =>
                                          setDraft((current) =>
                                            current
                                              ? { ...current, allDay: event.target.checked }
                                              : current,
                                          )
                                        }
                                        type="checkbox"
                                      />
                                      {t("spreadsheet.allDay")}
                                    </label>
                                    {!draft.allDay && (
                                      <div className="mt-2">
                                        <TimePicker
                                          label={t("spreadsheet.start")}
                                          onChange={(value) =>
                                            setDraft((current) =>
                                              current ? { ...current, startTime: value } : current,
                                            )
                                          }
                                          value={draft.startTime}
                                        />
                                      </div>
                                    )}
                                    {renderActions("startTime")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "startTime")}
                                    type="button"
                                  >
                                    {item.allDay ? t("spreadsheet.allDay") : item.startTime}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "endTime" && draft ? (
                                  <>
                                    {!draft.allDay && (
                                      <TimePicker
                                        label={t("spreadsheet.end")}
                                        onChange={(value) =>
                                          setDraft((current) =>
                                            current ? { ...current, endTime: value } : current,
                                          )
                                        }
                                        value={draft.endTime}
                                      />
                                    )}
                                    {renderActions("endTime")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "endTime")}
                                    type="button"
                                  >
                                    {item.allDay ? t("spreadsheet.allDay") : item.endTime}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <LinkCell
                                href={item.googleMapsUrl}
                                label={t("tripDetails.openGoogleMaps")}
                              />
                              <SpreadsheetCell>
                                {activeField === "notes" && draft ? (
                                  <>
                                    <textarea
                                      aria-label={t("spreadsheet.notes")}
                                      autoFocus
                                      className="min-h-20 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setDraft((current) =>
                                          current
                                            ? { ...current, notes: event.target.value }
                                            : current,
                                        )
                                      }
                                      value={draft.notes}
                                    />
                                    {renderActions("notes")}
                                  </>
                                ) : (
                                  <button
                                    className="block min-h-5 w-full max-w-64 cursor-text whitespace-pre-wrap break-words text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "notes")}
                                    type="button"
                                  >
                                    {item.notes}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              {showPrice && (
                                <>
                                  <SpreadsheetCell>{item.priceAmount}</SpreadsheetCell>
                                  <SpreadsheetCell>{item.priceCurrency}</SpreadsheetCell>
                                </>
                              )}
                              {showWebsite && <SpreadsheetCell>{item.website}</SpreadsheetCell>}
                            </tr>
                          )
                        })
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
