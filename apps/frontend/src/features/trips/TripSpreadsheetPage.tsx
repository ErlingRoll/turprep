import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createMeal,
  deleteActivity,
  deleteMeal,
  updateActivity,
  getTrip,
  updateHousingStay,
  updateMeal,
  reorderDayItems,
  setTripItemPreference,
  type Activity,
  type HousingStay,
  type Meal,
  type ReorderDayItemInput,
  type TripDetail,
} from "../../api"
import { DatePicker } from "../../components/DatePicker"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { MapLocateButton } from "../../components/MapLocateButton"
import { SettingsIcon } from "../../components/SettingsIcon"
import { TimePicker } from "../../components/TimePicker"
import {
  TripItemPreference,
  TripItemPreferenceDistribution,
} from "../../components/TripItemPreference"
import { DayItemForm } from "./DayItemForm"
import { getDateLocale } from "../../i18n"
import { getDayItemTitle, sortDayItems } from "../../lib/activity-format"
import { getDefaultCurrency } from "../../lib/currency"
import { formatDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import {
  isAllowedGoogleMapsUrl,
  type TripItemPreferenceValue,
  type TripItemType,
} from "@turprep/models"
import {
  replaceActivityInTrip,
  replaceHousingStayInTrip,
  replaceMealInTrip,
} from "./trip-state"
import { TripSettings } from "./TripSettings"

type TripSpreadsheetPageProps = {
  accessToken: string
  onTripDeleted: (trip: TripDetail) => Promise<void>
  onOpenMap: (itemType: "activity" | "meal", itemId: string) => void
  onReorderPendingChange: (isPending: boolean) => void
  onTripUpdated: (trip: TripDetail) => void
  trip: TripDetail
  userId: string
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
  lineY: number
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

type CreateItemDraft = ItemDraft & {
  googleMapsUrl: string
}

type EditableField = "endTime" | "notes" | "startTime" | "title"
type HousingEditableField = "checkIn" | "checkOut" | "name" | "notes" | "price" | "website"
type PendingDeletion = {
  item: Activity | Meal
  type: ItineraryRow["type"]
}
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

function SpreadsheetCell({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <td className={`border-b border-border-divider px-3 py-2 align-top text-sm ${className}`}>
      {children}
    </td>
  )
}

function SpreadsheetHeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-border-divider bg-surface-muted px-3 py-2 first:rounded-tl-2xl last:rounded-tr-2xl">
      {children}
    </th>
  )
}

type SpreadsheetItemActionsProps = {
  isBusy: boolean
  item: Activity | Meal
  onChangeGoogleMapsUrl: (googleMapsUrl: string | null) => Promise<string | null>
  onDelete: () => void
  onMoveToBackup: () => void
  onOpenMap?: () => void
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.42Z"
        fill="#4285f4"
      />
      <path
        d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.53A9.75 9.75 0 0 0 12 21.5Z"
        fill="#34a853"
      />
      <path
        d="M6.51 13.57A5.86 5.86 0 0 1 6.2 12c0-.54.09-1.07.3-1.57V7.9H3.27A9.5 9.5 0 0 0 2.25 12c0 1.48.35 2.88 1.02 4.1l3.24-2.53Z"
        fill="#fbbc05"
      />
      <path
        d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.73 5.4l3.24 2.53C7.29 8.11 9.45 6.39 12 6.39Z"
        fill="#ea4335"
      />
    </svg>
  )
}

function SpreadsheetItemActions({
  isBusy,
  item,
  onChangeGoogleMapsUrl,
  onDelete,
  onMoveToBackup,
  onOpenMap,
}: SpreadsheetItemActionsProps) {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isEditingMaps, setIsEditingMaps] = useState(false)
  const [mapsDraft, setMapsDraft] = useState("")
  const [mapsError, setMapsError] = useState<string | null>(null)
  const hasValidMapsUrl = Boolean(
    item.googleMapsUrl && isAllowedGoogleMapsUrl(item.googleMapsUrl),
  )

  function startEditingMaps() {
    setMapsDraft(item.googleMapsUrl ?? "")
    setMapsError(null)
    setIsEditingMaps(true)
  }

  async function saveMaps(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedGoogleMapsUrl = mapsDraft.trim()

    if (
      normalizedGoogleMapsUrl.length > 0 &&
      !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)
    ) {
      setMapsError(t("errors.googleMapsInvalid"))
      return
    }

    const error = await onChangeGoogleMapsUrl(normalizedGoogleMapsUrl || null)
    if (error) {
      setMapsError(error)
      return
    }

    setIsEditingMaps(false)
    setIsMenuOpen(false)
  }

  return (
    <div className="flex items-stretch justify-end gap-1">
      {onOpenMap && item.latitude !== null && item.longitude !== null && (
        <MapLocateButton label={t("tripMap.locate")} onClick={onOpenMap} />
      )}
      {hasValidMapsUrl ? (
          <a
            aria-label={t("tripDetails.openGoogleMaps")}
          className="grid size-9 place-items-center rounded-xl border border-border bg-surface p-2 text-muted hover:bg-surface-muted hover:text-brand"
            href={item.googleMapsUrl ?? undefined}
            rel="noreferrer"
            target="_blank"
            title={t("tripDetails.openGoogleMaps")}
          >
            <GoogleIcon />
          </a>
        ) : (
          <button
            aria-label={t("tripDetails.openGoogleMaps")}
            className="grid size-9 cursor-not-allowed place-items-center rounded-xl border border-border bg-surface p-2 text-disabled opacity-50 grayscale"
            disabled
            title={t("tripDetails.openGoogleMaps")}
            type="button"
          >
            <GoogleIcon />
          </button>
        )}
        <div className="relative">
          <button
            aria-expanded={isMenuOpen}
            aria-label={t("common.menu")}
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface p-2 text-muted hover:bg-surface-muted hover:text-brand disabled:opacity-50"
            disabled={isBusy}
            onClick={() => setIsMenuOpen((current) => !current)}
            title={t("common.menu")}
            type="button"
          >
            <svg aria-hidden="true" className="size-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 grid min-w-52 gap-1 rounded-xl border border-border bg-surface p-1 shadow-popover">
              {!isEditingMaps ? (
                <>
                  <button
                    className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-on-surface hover:bg-surface-muted"
                    onClick={() => {
                      setIsMenuOpen(false)
                      onMoveToBackup()
                    }}
                    type="button"
                  >
                    {t("backup.moveToBackup")}
                  </button>
                  <button
                    className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-on-surface hover:bg-surface-muted"
                    onClick={startEditingMaps}
                    type="button"
                  >
                    {t("spreadsheet.changeGoogleMaps")}
                  </button>
                  <button
                    className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-error hover:bg-danger-surface"
                    onClick={() => {
                      setIsMenuOpen(false)
                      onDelete()
                    }}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </>
              ) : (
                <form className="grid gap-2 p-2" onSubmit={(event) => void saveMaps(event)}>
                  <label className="grid gap-1 text-xs font-semibold text-muted">
                    {t("spreadsheet.changeGoogleMaps")}
                    <input
                      autoFocus
                      className="w-64 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-on-surface outline-none focus:border-brand"
                      onChange={(event) => {
                        setMapsDraft(event.target.value)
                        setMapsError(null)
                      }}
                      placeholder={t("tripDetails.googleMapsPlaceholder")}
                      type="url"
                      value={mapsDraft}
                    />
                  </label>
                  {mapsError && <p className="text-xs text-error">{mapsError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
                      onClick={() => setIsEditingMaps(false)}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
                      disabled={isBusy}
                      type="submit"
                    >
                      {isBusy ? t("common.saving") : t("common.save")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
    </div>
  )
}

export function TripSpreadsheetPage({
  accessToken,
  onTripDeleted,
  onOpenMap,
  onReorderPendingChange,
  onTripUpdated,
  trip,
  userId,
  showDetails,
}: TripSpreadsheetPageProps) {
  const { i18n, t } = useTranslation()
  const locale = getDateLocale(i18n.language)
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [housingEditingKey, setHousingEditingKey] = useState<string | null>(null)
  const [housingDraft, setHousingDraft] = useState<HousingDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [creatingDayDate, setCreatingDayDate] = useState<string | null>(null)
  const [creatingItemType, setCreatingItemType] = useState<ItineraryRow["type"]>("activity")
  const [createDraft, setCreateDraft] = useState<CreateItemDraft>(getCreateItemDraft)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createGoogleMapsError, setCreateGoogleMapsError] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<SpreadsheetDraggedItem | null>(null)
  const [dropTarget, setDropTargetState] = useState<SpreadsheetDropTarget | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const dropTargetRef = useRef<SpreadsheetDropTarget | null>(null)
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
  const rowCounts = itineraryRows.map(
    ({ day, rows }) =>
      1 + Math.max(rows.length, 1) + (creatingDayDate === day.date ? 1 : 0),
  )
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

  const dropLineBounds = tableRef.current?.getBoundingClientRect()
  const draggedItemKey = draggedItem
    ? `${draggedItem.itemType}:${draggedItem.itemId}`
    : null
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

  function getNearestDropTarget(dayDate: string, clientY: number) {
    const table = tableRef.current
    if (!table) {
      return null
    }

    const itemRows = Array.from(
      table.querySelectorAll<HTMLTableRowElement>(
        `tr[data-drop-day="${dayDate}"][data-drop-item-index]`,
      ),
    )
    const landingZones =
      itemRows.length > 0
        ? (() => {
            const rowBounds = itemRows.map((row) => row.getBoundingClientRect())
            return [
              { index: 0, lineY: rowBounds[0].top },
              ...rowBounds.slice(1).map((bounds, index) => ({
                index: index + 1,
                lineY: (rowBounds[index].bottom + bounds.top) / 2,
              })),
              { index: rowBounds.length, lineY: rowBounds.at(-1)?.bottom ?? rowBounds[0].bottom },
            ]
          })()
        : (() => {
            const emptyRow = table.querySelector<HTMLTableRowElement>(
              `tr[data-drop-empty-day="${dayDate}"]`,
            )
            if (!emptyRow) {
              return []
            }

            const bounds = emptyRow.getBoundingClientRect()
            return [{ index: 0, lineY: bounds.top + bounds.height / 2 }]
          })()

    return landingZones.reduce<SpreadsheetDropTarget | null>((nearest, zone) => {
      const candidate = { dayDate, ...zone }
      return !nearest ||
        Math.abs(candidate.lineY - clientY) < Math.abs(nearest.lineY - clientY)
        ? candidate
        : nearest
    }, null)
  }

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
          onStartTimeChange={(startTime) => setCreateDraft((current) => ({ ...current, startTime }))}
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
      setCreateGoogleMapsError(null)
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
      queueReorder(optimisticTrip)
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
    setIsSaving(true)
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
    setIsSaving(true)
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
    const previousPreferences = trip.preferences
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

    setSavingPreferenceKey(preferenceKey)
    setSaveError(null)
    onTripUpdated({ ...trip, preferences: nextPreferences })

    try {
      const savedPreference = await setTripItemPreference(accessToken, trip.id, {
        itemType,
        itemId,
        value,
      })
      const reconciledPreferences = nextPreferences.filter(
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

      onTripUpdated({ ...trip, preferences: reconciledPreferences })
    } catch (reason: unknown) {
      onTripUpdated({ ...trip, preferences: previousPreferences })
      setSaveError(getErrorMessage(reason))
    } finally {
      setSavingPreferenceKey(null)
    }
  }

  async function confirmPendingDeletion() {
    if (!pendingDeletion) {
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
  ) {
    if (!draggedItem) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const nextDropTarget = getNearestDropTarget(dayDate, event.clientY)
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

  function queueReorder(optimisticTrip: TripDetail) {
    const reorderGeneration = ++reorderGenerationRef.current
    if (pendingReorderCountRef.current === 0) {
      onReorderPendingChange(true)
    }
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
        if (pendingReorderCountRef.current === 0) {
          onReorderPendingChange(false)
        }
      })
  }

  async function handleSpreadsheetDrop(
    event: DragEvent<HTMLTableRowElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()

    const selectedDropTarget = dropTargetRef.current
    const draggedItemKey = draggedItem
      ? `${draggedItem.itemType}:${draggedItem.itemId}`
      : event.dataTransfer.getData("text/plain")
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
    handleSpreadsheetDragOver(event, dayDate)
  }

  async function handleSpreadsheetDayDrop(event: DragEvent<HTMLTableRowElement>) {
    await handleSpreadsheetDrop(event)
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
        {reorderError && <p className="mt-3 text-sm text-error">{reorderError}</p>}
        {saveError && !editingFieldKey && !housingEditingKey && (
          <p className="mt-3 text-sm text-error">{saveError}</p>
        )}

        <div className="relative left-1/2 mt-5 w-screen -translate-x-1/2 px-2">
          <div className="mx-auto w-fit rounded-2xl border border-border-card bg-surface">
            <table
              className="mx-auto w-max min-w-[83rem] table-fixed border-collapse text-left"
              ref={tableRef}
            >
              <colgroup>
                <col className="w-52" />
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
                  <SpreadsheetHeaderCell>{null}</SpreadsheetHeaderCell>
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
                        onDrop={(event) => void handleSpreadsheetDayDrop(event)}
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
                                      ? formatDate(housing.checkIn)
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
                                      ? formatDate(housing.checkOut)
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
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {formatDate(day.date)}
                              {day.title?.trim() ? ` · ${day.title}` : ""}
                            </span>
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
                          <td className="border-b border-border-divider p-3" colSpan={itineraryColumnCount}>
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
                            <Fragment key={itemKey}>
                              <tr
                                className="group bg-surface hover:bg-surface-soft"
                                data-drop-day={day.date}
                                data-drop-item-index={itemIndex}
                                draggable
                                onDragOver={(event) =>
                                  handleSpreadsheetDragOver(event, day.date)
                                }
                                onDragEnd={handleSpreadsheetDragEnd}
                                onDragStart={(event) =>
                                  handleSpreadsheetDragStart(event, day.date, {
                                    item,
                                    type,
                                  })
                                }
                                onDrop={(event) => void handleSpreadsheetDrop(event)}
                              >
                                <td className="relative border-b-0 p-0" colSpan={itineraryColumnCount}>
                                  <table className="min-w-full table-fixed border-collapse text-left">
                                    <colgroup>
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
                                    <tbody>
                                      <tr className="group-hover:bg-surface-soft">
                              <SpreadsheetCell className="border-b-0 text-base font-semibold">
                                {formatDate(item.tripDate ?? day.date)}
                              </SpreadsheetCell>
                              <SpreadsheetCell className="border-b-0 text-base font-semibold">
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
                                    className={`w-full cursor-text text-left underline decoration-2 underline-offset-4 transition hover:text-brand ${
                                      type === "activity"
                                        ? "decoration-type-activity"
                                        : "decoration-type-meal"
                                    }`}
                                    onClick={() => startEditing(type, item, "title")}
                                    type="button"
                                  >
                                    {getDayItemTitle(item, t("tripDetails.untitledItem"))}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <SpreadsheetCell className="border-b-0">
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
                              <SpreadsheetCell className="border-b-0">
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
                              {showPrice && (
                                <>
                                  <SpreadsheetCell className="border-b-0">
                                    {item.priceAmount}
                                  </SpreadsheetCell>
                                  <SpreadsheetCell className="border-b-0">
                                    {item.priceCurrency}
                                  </SpreadsheetCell>
                                </>
                              )}
                              {showWebsite && (
                                <SpreadsheetCell className="border-b-0">
                                  {item.website}
                                </SpreadsheetCell>
                              )}
                              <SpreadsheetCell className="border-b-0">
                                <div className="flex items-start justify-end gap-2 pr-2">
                                  <TripItemPreference
                                    compact
                                    disabled={savingPreferenceKey === `${type}:${item.id}`}
                                    itemId={item.id}
                                    itemType={type}
                                    onChange={(value) =>
                                      void handlePreferenceChange(type, item.id, value)
                                    }
                                    preferences={trip.preferences}
                                    userId={userId}
                                  />
                                  <SpreadsheetItemActions
                                    isBusy={isSaving}
                                    item={item}
                                    onChangeGoogleMapsUrl={(googleMapsUrl) =>
                                      saveItemGoogleMapsUrl(type, item, googleMapsUrl)
                                    }
                                    onDelete={() => setPendingDeletion({ item, type })}
                                    onMoveToBackup={() => void moveItemToBackup(type, item)}
                                    onOpenMap={() => onOpenMap(type, item.id)}
                                  />
                                </div>
                              </SpreadsheetCell>
                            </tr>
                            <tr className="group-hover:bg-surface-soft">
                              <td
                                className="border-b border-border-divider px-3 pb-2 pt-0 text-sm"
                                colSpan={itineraryColumnCount}
                              >
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
                                    aria-label={t("spreadsheet.notes")}
                                    className={`inline-block max-w-full min-h-5 cursor-text whitespace-pre-wrap break-words text-left transition hover:text-brand ${
                                      item.notes?.trim() ? "text-on-surface" : "text-muted"
                                    }`}
                                    onClick={() => startEditing(type, item, "notes")}
                                    type="button"
                                  >
                                    {item.notes?.trim() ? item.notes : t("spreadsheet.addNote")}
                                  </button>
                                )}
                              </td>
                            </tr>
                                  </tbody>
                                </table>
                                <div className="pointer-events-none absolute inset-y-0 right-0">
                                  <TripItemPreferenceDistribution
                                    itemId={item.id}
                                    itemType={type}
                                    orientation="vertical"
                                    preferences={trip.preferences}
                                  />
                                </div>
                                </td>
                              </tr>
                            </Fragment>
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
        onConfirm={() => void confirmPendingDeletion()}
        title={t("common.confirmDeletionTitle")}
      />
    </section>
  )
}
