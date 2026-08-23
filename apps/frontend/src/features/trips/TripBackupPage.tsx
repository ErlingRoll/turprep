import { Fragment, useRef, useState, type DragEvent, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createHousingStay,
  createMeal,
  deleteActivity,
  deleteHousingStay,
  deleteMeal,
  setTripItemPreference,
  updateActivity,
  updateHousingStay,
  updateMeal,
  type Activity,
  type HousingStay,
  type Meal,
  type TripDetail,
} from "../../api"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { DatePicker } from "../../components/DatePicker"
import { TimePicker } from "../../components/TimePicker"
import { MobileMenuButton } from "../../components/MobileMenuButton"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { ItemDetailsEditor } from "../../components/ItemDetails"
import { TripItemPreference } from "../../components/TripItemPreference"
import { useToast } from "../../components/ToastContext"
import type { ItemDetailValues } from "../../components/ItemDetails"
import { getErrorMessage, isGoogleMapsError } from "../../lib/errors"
import { getDefaultCurrency } from "../../lib/currency"
import { formatActivityTime, getDayItemTitle, sortActivities, sortDayItems } from "../../lib/activity-format"
import { formatDate } from "../../lib/date-format"
import { shiftDate } from "../../lib/trip-dates"
import { MobileDayPager } from "./MobileDayPager"
import { SpreadsheetHeaderCell } from "./SpreadsheetCell"
import {
  getDraggedItemKey,
  getItineraryRowKey,
  getNearestSpreadsheetDropTarget,
  isDragBlockedTarget,
  setSpreadsheetDragData,
} from "./spreadsheet-drag"
import { getSpreadsheetItemDraft } from "./spreadsheet-item-draft"
import {
  applyDefaultEndTimeForStartEdit,
  getDefaultEndTimeForStart,
  getRowsForTimeEdit,
  getTimeOrderValidationError,
} from "./spreadsheet-time-validation"
import { SpreadsheetItineraryRow } from "./SpreadsheetItineraryRow"
import { TripDayNavigator } from "./TripDayNavigator"
import type {
  EditableField,
  ItemDraft,
  ItineraryRow,
  SpreadsheetDraggedItem,
  SpreadsheetDropTarget,
} from "./spreadsheet-types"
import type { TripDaySelection } from "./useTripDaySelection"
import {
  isAllowedGoogleMapsUrl,
  type TripItemPreferenceValue,
  type TripItemType,
} from "@turprep/models"

type BackupType = "activity" | "meal" | "housing"
type BackupItem = Activity | Meal | HousingStay
type BackupEntry = { type: BackupType; item: BackupItem }
type BackupPlannerType = "activity" | "meal"
type BackupPlannerRow = ItineraryRow
type DesktopBackupGroup = { id: string; label: string; rows: BackupPlannerRow[]; date: string | null }

type TripBackupPageProps = {
  accessToken: string
  trip: TripDetail
  userId: string
  onTripUpdated: (trip: TripDetail) => void
  daySelection: TripDaySelection
  showDetails: boolean
}

export function TripBackupPage({
  accessToken,
  trip,
  userId,
  onTripUpdated,
  daySelection,
  showDetails,
}: TripBackupPageProps) {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const currencies =
    trip.acceptedCurrencies.length > 0 ? trip.acceptedCurrencies : [getDefaultCurrency()]
  const [selectedType, setSelectedType] = useState<BackupType>("activity")
  const [formType, setFormType] = useState<BackupType | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [title, setTitle] = useState("")
  const [googleMapsUrl, setGoogleMapsUrl] = useState("")
  const [tentativeDate, setTentativeDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [allDay, setAllDay] = useState(true)
  const [name, setName] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [notes, setNotes] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<BackupEntry | null>(null)
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [creatingDesktopGroupId, setCreatingDesktopGroupId] = useState<string | null>(null)
  const [desktopDraggedItem, setDesktopDraggedItem] = useState<SpreadsheetDraggedItem | null>(null)
  const [desktopDropTarget, setDesktopDropTargetState] = useState<SpreadsheetDropTarget | null>(null)
  const [desktopEditingFieldKey, setDesktopEditingFieldKey] = useState<string | null>(null)
  const [desktopDraft, setDesktopDraft] = useState<ItemDraft | null>(null)
  const [desktopSaveError, setDesktopSaveError] = useState<string | null>(null)
  const desktopTableRef = useRef<HTMLTableElement>(null)
  const desktopDropTargetRef = useRef<SpreadsheetDropTarget | null>(null)

  const allBackupActivities = trip.backupActivities
  const allBackupMeals = trip.meals.filter((meal) => meal.isBackup)
  const allBackupHousing = trip.housingStays.filter((stay) => stay.isBackup)
  const { selectedDayDate, selectedDayDates } = daySelection
  const selectedDay = trip.days.find((day) => day.date === selectedDayDate) ?? trip.days[0]
  const datesForFiltering =
    selectedDayDates.length > 0 ? selectedDayDates : selectedDay ? [selectedDay.date] : []
  const areAllDaysSelected =
    trip.days.length > 0 && trip.days.every((day) => datesForFiltering.includes(day.date))

  function isDateSelected(date: string | null) {
    return date === null || datesForFiltering.includes(date)
  }

  function isHousingSelected(stay: HousingStay) {
    if (stay.checkIn === null || stay.checkOut === null) {
      return true
    }

    return datesForFiltering.some((date) => stay.checkIn! <= date && date < stay.checkOut!)
  }

  function sortBackupActivities(activities: Activity[]) {
    return activities
      .map((activity, index) => {
        const preferences = trip.preferences.filter(
          (preference) => preference.itemType === "activity" && preference.itemId === activity.id,
        )
        const greenVotes = preferences.filter((preference) => preference.value === "green").length
        const redVotes = preferences.filter((preference) => preference.value === "red").length

        return {
          activity,
          greenVotes,
          redVotes,
          score: greenVotes - redVotes,
          totalVotes: preferences.length,
          index,
        }
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.greenVotes - left.greenVotes ||
          right.totalVotes - left.totalVotes ||
          left.redVotes - right.redVotes ||
          left.index - right.index,
      )
      .map(({ activity }) => activity)
  }

  const backupActivities = sortBackupActivities(
    !areAllDaysSelected
      ? allBackupActivities.filter((activity) => isDateSelected(activity.tripDate))
      : allBackupActivities,
  )
  const backupMeals = !areAllDaysSelected
    ? allBackupMeals.filter((meal) => isDateSelected(meal.tripDate))
    : allBackupMeals
  const backupHousing = !areAllDaysSelected
    ? allBackupHousing.filter(isHousingSelected)
    : allBackupHousing

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
      setFormError(getErrorMessage(reason))
    } finally {
      setSavingPreferenceKey(null)
    }
  }

  function resetForm() {
    setFormType(null)
    setEditingId(null)
    setActivating(false)
    setTitle("")
    setGoogleMapsUrl("")
    setTentativeDate("")
    setStartTime("")
    setEndTime("")
    setAllDay(true)
    setName("")
    setCheckIn("")
    setCheckOut("")
    setNotes("")
    setFormError(null)
    setGoogleMapsError(null)
    setCreatingDesktopGroupId(null)
    setDesktopEditingFieldKey(null)
    setDesktopDraft(null)
    setDesktopSaveError(null)
  }

  function startCreate(type: BackupType) {
    resetForm()
    setFormType(type)
  }

  function startDesktopCreate(type: BackupPlannerType, group: DesktopBackupGroup) {
    resetForm()
    setFormType(type)
    setTentativeDate(group.date ?? "")
    setCreatingDesktopGroupId(group.id)
  }

  function startEdit(item: BackupItem, type: BackupType, shouldActivate = false) {
    setFormType(type)
    setEditingId(item.id)
    setActivating(shouldActivate)
    setFormError(null)
    setGoogleMapsError(null)

    if (type === "housing") {
      const housing = item as HousingStay
      setName(housing.name)
      setGoogleMapsUrl(housing.googleMapsUrl ?? "")
      setCheckIn(housing.checkIn ?? "")
      setCheckOut(housing.checkOut ?? "")
      setNotes(housing.notes ?? "")
      return
    }

    const dayItem = item as Activity | Meal
    setTitle(dayItem.title ?? "")
    setGoogleMapsUrl(dayItem.googleMapsUrl ?? "")
    setTentativeDate(dayItem.tripDate ?? "")
    setStartTime(dayItem.startTime ?? "")
    setEndTime(dayItem.endTime ?? "")
    setAllDay(dayItem.allDay)
    setNotes(dayItem.notes ?? "")
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value)
    if (!value) {
      setAllDay(true)
      setEndTime("")
      return
    }

    setAllDay(false)
    if (!endTime) {
      const rows = tentativeDate
        ? desktopBackupGroups.find((group) => group.date === tentativeDate)?.rows ?? []
        : []
      const rowKey = editingId && (formType === "activity" || formType === "meal")
        ? `${formType}:${editingId}`
        : null
      setEndTime(getDefaultEndTimeForStart(rows, value, rowKey) ?? "")
    }
  }

  function handleEndTimeChange(value: string) {
    setEndTime(value)
  }

  function addPlannedActivity(currentTrip: TripDetail, activity: Activity): TripDetail {
    if (activity.tripDate === null) {
      return currentTrip
    }

    return {
      ...currentTrip,
      backupActivities: currentTrip.backupActivities.filter(
        (currentActivity) => currentActivity.id !== activity.id,
      ),
      days: currentTrip.days.map((day) =>
        day.date === activity.tripDate
          ? { ...day, activities: sortActivities([...day.activities, activity]) }
          : day,
      ),
    }
  }

  function updateTripItem(currentTrip: TripDetail, item: BackupItem, type: BackupType): TripDetail {
    if (type === "housing") {
      const housing = item as HousingStay
      return {
        ...currentTrip,
        housingStays: currentTrip.housingStays.map((stay) =>
          stay.id === housing.id ? housing : stay,
        ),
      }
    }

    if (type === "activity" && (item as Activity).isBackup) {
      const activity = item as Activity
      return {
        ...currentTrip,
        backupActivities: currentTrip.backupActivities.map((currentActivity) =>
          currentActivity.id === activity.id ? activity : currentActivity,
        ),
      }
    }

    if (type === "meal") {
      const meal = item as Meal
      return {
        ...currentTrip,
        meals: currentTrip.meals.map((currentMeal) =>
          currentMeal.id === meal.id ? meal : currentMeal,
        ),
      }
    }

    return addPlannedActivity(currentTrip, item as Activity)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formType) {
      return
    }

    const normalizedGoogleMapsUrl = googleMapsUrl.trim()
    if (normalizedGoogleMapsUrl && !isAllowedGoogleMapsUrl(normalizedGoogleMapsUrl)) {
      setGoogleMapsError(t("errors.googleMapsInvalid"))
      return
    }

    if (activating && formType !== "housing" && !tentativeDate) {
      setFormError(t("backup.dateRequired"))
      return
    }

    if (activating && formType === "housing" && (!checkIn || !checkOut)) {
      setFormError(t("backup.housingDatesRequired"))
      return
    }

    setIsSaving(true)
    setFormError(null)
    setGoogleMapsError(null)

    try {
      const isBackup = !activating

      if (formType === "housing") {
        const saved = editingId
          ? await updateHousingStay(accessToken, trip.id, editingId, {
              name,
              checkIn: checkIn || null,
              checkOut: checkOut || null,
              isBackup,
              notes,
              googleMapsUrl: normalizedGoogleMapsUrl || null,
              placeName: null,
              placeAddress: null,
              latitude: null,
              longitude: null,
              priceAmount: null,
              priceCurrency: null,
              website: null,
            })
          : await createHousingStay(accessToken, trip.id, {
              name,
              checkIn: checkIn || null,
              checkOut: checkOut || null,
              isBackup: true,
              notes,
              googleMapsUrl: normalizedGoogleMapsUrl || null,
              placeName: null,
              placeAddress: null,
              latitude: null,
              longitude: null,
              priceAmount: null,
              priceCurrency: null,
              website: null,
            })
        onTripUpdated(updateTripItem(trip, saved, formType))
      } else {
        const input = {
          tripDate: tentativeDate || null,
          isBackup,
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
        const saved =
          formType === "activity"
            ? editingId
              ? await updateActivity(accessToken, trip.id, editingId, input)
              : await createActivity(accessToken, trip.id, input)
            : editingId
              ? await updateMeal(accessToken, trip.id, editingId, input)
              : await createMeal(accessToken, trip.id, input)

        onTripUpdated(
          formType === "activity" && !saved.isBackup
            ? addPlannedActivity(trip, saved)
            : formType === "activity"
              ? {
                  ...trip,
                  backupActivities: editingId
                    ? trip.backupActivities.map((activity) =>
                        activity.id === saved.id ? saved : activity,
                      )
                    : [...trip.backupActivities, saved],
                }
              : {
                  ...trip,
                  meals: editingId
                    ? trip.meals.map((meal) => (meal.id === saved.id ? saved : meal))
                    : [...trip.meals, saved],
                },
        )
      }

      resetForm()
    } catch (reason: unknown) {
      if (isGoogleMapsError(reason)) {
        setGoogleMapsError(getErrorMessage(reason))
      } else {
        setFormError(getErrorMessage(reason))
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function moveToPlan({ item, type }: BackupEntry) {
    const hasDate =
      type === "housing"
        ? (item as HousingStay).checkIn !== null && (item as HousingStay).checkOut !== null
        : (item as Activity | Meal).tripDate !== null

    if (!hasDate) {
      startEdit(item, type, true)
      return
    }

    setFormError(null)
    try {
      const saved =
        type === "activity"
          ? await updateActivity(accessToken, trip.id, item.id, { isBackup: false })
          : type === "meal"
            ? await updateMeal(accessToken, trip.id, item.id, { isBackup: false })
            : await updateHousingStay(accessToken, trip.id, item.id, { isBackup: false })
      onTripUpdated(updateTripItem(trip, saved, type))
    } catch (reason: unknown) {
      setFormError(getErrorMessage(reason))
    }
  }

  async function handleSaveDetails({ item, type }: BackupEntry, details: ItemDetailValues) {
    const saved =
      type === "activity"
        ? await updateActivity(accessToken, trip.id, item.id, details)
        : type === "meal"
          ? await updateMeal(accessToken, trip.id, item.id, details)
          : await updateHousingStay(accessToken, trip.id, item.id, details)

    onTripUpdated(updateTripItem(trip, saved, type))
  }

  async function saveBackupItemGoogleMapsUrl(
    type: BackupPlannerType,
    item: Activity | Meal,
    googleMapsUrl: string | null,
  ): Promise<string | null> {
    setIsSaving(true)
    setFormError(null)
    setGoogleMapsError(null)

    try {
      if (type === "meal") {
        const savedMeal = await updateMeal(accessToken, trip.id, item.id, { googleMapsUrl })
        onTripUpdated({
          ...trip,
          meals: trip.meals.map((currentMeal) => (currentMeal.id === savedMeal.id ? savedMeal : currentMeal)),
        })
      } else {
        const savedActivity = await updateActivity(accessToken, trip.id, item.id, { googleMapsUrl })
        onTripUpdated({
          ...trip,
          backupActivities: trip.backupActivities.map((activity) =>
            activity.id === savedActivity.id ? savedActivity : activity,
          ),
        })
      }

      return null
    } catch (reason: unknown) {
      return getErrorMessage(reason)
    } finally {
      setIsSaving(false)
    }
  }

  function startDesktopEditing(type: BackupPlannerType, item: Activity | Meal, field: EditableField) {
    setDesktopEditingFieldKey(`${type}:${item.id}:${field}`)
    setDesktopDraft(getSpreadsheetItemDraft(item))
    setDesktopSaveError(null)
  }

  function cancelDesktopEditing() {
    if (isSaving) {
      return
    }

    setDesktopEditingFieldKey(null)
    setDesktopDraft(null)
    setDesktopSaveError(null)
  }

  async function saveDesktopEditingField(
    type: BackupPlannerType,
    item: Activity | Meal,
    field: EditableField,
    nextDraft?: ItemDraft,
  ) {
    if (desktopEditingFieldKey !== `${type}:${item.id}:${field}`) {
      return
    }
    const currentDraft = nextDraft ?? desktopDraft
    if (!currentDraft) {
      return
    }

    setDesktopSaveError(null)
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
      let editedRows: BackupPlannerRow[] | null = null
      const dayGroup = desktopBackupGroups.find((group) =>
        group.rows.some((row) => getItineraryRowKey(row) === rowKey),
      )
      if (dayGroup) {
        const dayRows = dayGroup.rows
        if (field === "startTime") {
          resolvedDraft = applyDefaultEndTimeForStartEdit(dayRows, rowKey, resolvedDraft)
        }
        editedRows = getRowsForTimeEdit(dayRows, rowKey, resolvedDraft)

        const timeOrderError = getTimeOrderValidationError(dayRows, rowKey, resolvedDraft)
        if (timeOrderError) {
          addToast(t(timeOrderError))
          setDesktopEditingFieldKey(null)
          setDesktopDraft(null)
          return
        }
      }

      setIsSaving(true)
      if (!dayGroup || !editedRows) {
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
      const optimisticTrip = getOptimisticBackupTrip(
        trip,
        new Map([[dayGroup.id, optimisticRows]]),
      )
      onTripUpdated(optimisticTrip)
      setDesktopEditingFieldKey(null)
      setDesktopDraft(null)

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
          setDesktopEditingFieldKey(`${type}:${item.id}:${field}`)
          setDesktopDraft(resolvedDraft)
        }, 0)
      } finally {
        setIsSaving(false)
      }

      return
    }

    setIsSaving(true)
    try {
      const saved =
        type === "meal"
          ? await updateMeal(accessToken, trip.id, item.id, input)
          : await updateActivity(accessToken, trip.id, item.id, input)

      onTripUpdated(updateTripItem(trip, saved, type))
      setDesktopEditingFieldKey(null)
      setDesktopDraft(null)
    } catch (reason: unknown) {
      setDesktopSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete({ item, type }: BackupEntry) {
    const key = `${type}:${item.id}`
    setDeletingKey(key)

    try {
      if (type === "activity") {
        await deleteActivity(accessToken, trip.id, item.id)
        onTripUpdated({
          ...trip,
          backupActivities: trip.backupActivities.filter((activity) => activity.id !== item.id),
        })
      } else if (type === "meal") {
        await deleteMeal(accessToken, trip.id, item.id)
        onTripUpdated({
          ...trip,
          meals: trip.meals.filter((meal) => meal.id !== item.id),
        })
      } else {
        await deleteHousingStay(accessToken, trip.id, item.id)
        onTripUpdated({
          ...trip,
          housingStays: trip.housingStays.filter((stay) => stay.id !== item.id),
        })
      }
    } catch (reason: unknown) {
      setFormError(getErrorMessage(reason))
    } finally {
      setDeletingKey(null)
      setPendingDeletion(null)
    }
  }

  function renderForm(inline = false) {
    if (!formType) {
      return null
    }

    return (
      <form
        className={
          inline
            ? "mt-3 grid gap-3 border-t border-border-divider pt-3"
            : "rounded-2xl border border-border-soft bg-surface-soft p-4"
        }
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-brand">
            {editingId ? (activating ? t("backup.activate") : t("backup.edit")) : t("backup.add")}
          </h2>
          <button
            className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-surface-muted"
            onClick={resetForm}
            type="button"
          >
            {t("common.cancel")}
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {formType === "housing" ? (
            <>
              <label className="grid gap-1.5 text-sm font-medium text-muted">
                {t("tripDetails.housingName")}
                <input
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-muted">
                {t("tripDetails.googleMapsUrl")}
                <input
                  aria-invalid={Boolean(googleMapsError)}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
                  onChange={(event) => setGoogleMapsUrl(event.target.value)}
                  placeholder={t("tripDetails.googleMapsPlaceholder")}
                  type="url"
                  value={googleMapsUrl}
                />
                {googleMapsError && (
                  <span className="font-normal text-error">{googleMapsError}</span>
                )}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  clearable
                  label={t("tripDetails.checkIn")}
                  maxDate={shiftDate(trip.endDate, 1)}
                  minDate={trip.startDate}
                  onChange={setCheckIn}
                  value={checkIn}
                />
                <DatePicker
                  clearable
                  label={t("tripDetails.checkOut")}
                  maxDate={shiftDate(trip.endDate, 1)}
                  minDate={trip.startDate}
                  onChange={setCheckOut}
                  value={checkOut}
                />
              </div>
            </>
          ) : (
            <>
              <label className="grid gap-1.5 text-sm font-medium text-muted">
                {formType === "meal" ? t("tripDetails.mealName") : t("tripDetails.whatToDo")}
                <input
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
                  onChange={(event) => setTitle(event.target.value)}
                  required={!googleMapsUrl.trim()}
                  value={title}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-muted">
                {t("tripDetails.googleMapsUrl")}
                <input
                  aria-invalid={Boolean(googleMapsError)}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
                  onChange={(event) => setGoogleMapsUrl(event.target.value)}
                  placeholder={t("tripDetails.googleMapsPlaceholder")}
                  type="url"
                  value={googleMapsUrl}
                />
                {googleMapsError && (
                  <span className="font-normal text-error">{googleMapsError}</span>
                )}
              </label>
              <DatePicker
                clearable
                label={t("backup.tentativeDate")}
                maxDate={trip.endDate}
                minDate={trip.startDate}
                onChange={setTentativeDate}
                value={tentativeDate}
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  checked={allDay}
                  className="size-4 accent-brand"
                  onChange={(event) => setAllDay(event.target.checked)}
                  type="checkbox"
                />
                {t("tripDetails.allDay")}
              </label>
              {!allDay && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TimePicker
                    label={t("common.from")}
                    onChange={handleStartTimeChange}
                    value={startTime}
                  />
                  {startTime && (
                    <TimePicker
                      label={t("common.to")}
                      onChange={handleEndTimeChange}
                      showLabel={false}
                      value={endTime}
                    />
                  )}
                </div>
              )}
            </>
          )}
          <label className="grid gap-1.5 text-sm font-medium text-muted">
            {t("tripDetails.notes")}
            <textarea
              className="min-h-20 resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex justify-end">
            <button
              className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving
                ? t("common.saving")
                : activating
                  ? t("backup.moveToPlan")
                  : t("common.save")}
            </button>
          </div>
        </div>
      </form>
    )
  }

  function renderItem(type: BackupType, item: BackupItem, includeMoveToPlan = true) {
    const key = `${type}:${item.id}`
    const dayItem = type === "housing" ? null : (item as Activity | Meal)
    const housing = type === "housing" ? (item as HousingStay) : null
    const typeClass =
      type === "activity"
        ? "trip-item-type-activity"
        : type === "meal"
          ? "trip-item-type-meal"
          : "trip-item-type-housing"

    return (
      <article
        className={`rounded-2xl border border-border-soft bg-surface ${typeClass} p-4`}
        key={key}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-brand">
                {dayItem ? getDayItemTitle(dayItem, t("tripDetails.untitledItem")) : housing?.name}
              </h3>
              {dayItem && (
                <p className="mt-1 text-sm text-muted">
                  {dayItem.tripDate ? formatDate(dayItem.tripDate) : t("backup.noTentativeDate")} ·{" "}
                  {formatActivityTime(dayItem, {
                    allDay: t("tripDetails.allDay"),
                    timeNotSet: t("tripDetails.timeNotSet"),
                  })}
                </p>
              )}
              {housing && (
                <p className="mt-1 text-sm text-muted">
                  {housing.checkIn && housing.checkOut
                    ? `${formatDate(housing.checkIn)} – ${formatDate(housing.checkOut)}`
                    : t("backup.noTentativeDates")}
                </p>
              )}
              {item.googleMapsUrl && (
                <GoogleMapsLinkButton
                  href={item.googleMapsUrl}
                  label={t("tripDetails.openGoogleMaps")}
                />
              )}
            </div>
            <div className="relative flex shrink-0">
              <MobileMenuButton
                closeLabel={t("common.close")}
                isOpen={openMenuKey === key}
                menuLabel={t("common.menu")}
                onToggle={() => setOpenMenuKey((currentKey) => (currentKey === key ? null : key))}
                openLabel={t("common.menu")}
                showOnDesktop
              />
              {openMenuKey === key && (
                <div className="absolute right-0 top-full z-10 mt-1 grid min-w-40 gap-1 rounded-xl border border-border bg-surface p-1 shadow-popover">
                  {includeMoveToPlan && (
                    <button
                      className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-brand hover:bg-surface-muted"
                      onClick={() => {
                        setOpenMenuKey(null)
                        void moveToPlan({ item, type })
                      }}
                      type="button"
                    >
                      {t("backup.moveToPlan")}
                    </button>
                  )}
                  <button
                    className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-on-surface hover:bg-surface-muted"
                    onClick={() => {
                      setOpenMenuKey(null)
                      startEdit(item, type)
                    }}
                    type="button"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-error hover:bg-danger-surface"
                    disabled={deletingKey === key}
                    onClick={() => {
                      setOpenMenuKey(null)
                      setPendingDeletion({ item, type })
                    }}
                    type="button"
                  >
                    {deletingKey === key ? "..." : t("common.delete")}
                  </button>
                </div>
              )}
            </div>
          </div>
          {item.notes?.trim() && (
            <p className="whitespace-pre-wrap text-sm text-muted">{item.notes}</p>
          )}
          {showDetails && (
            <ItemDetailsEditor
              currencies={currencies}
              details={{
                priceAmount: item.priceAmount ?? null,
                priceCurrency: item.priceCurrency ?? null,
                website: item.website ?? null,
              }}
              onSave={(details) => handleSaveDetails({ item, type }, details)}
            />
          )}
          <TripItemPreference
            disabled={savingPreferenceKey === key}
            itemId={item.id}
            itemType={type}
            onChange={(value) => void handlePreferenceChange(type, item.id, value)}
            preferences={trip.preferences}
            userId={userId}
          />
          {editingId === item.id && formType === type && renderForm(true)}
        </div>
      </article>
    )
  }

  function sortBackupPlannerRows(rows: BackupPlannerRow[]) {
    const typeByItemId = new Map(rows.map((row) => [row.item.id, row.type]))

    return sortDayItems(rows.map((row) => row.item)).map((item) => ({
      item,
      type: typeByItemId.get(item.id) ?? "activity",
    }))
  }

  const showPrice = showDetails && trip.itemDetailVisibility.showPrice
  const showWebsite = showDetails && trip.itemDetailVisibility.showWebsite
  const itineraryColumnCount = 5 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)
  const desktopBackupGroups: DesktopBackupGroup[] = (() => {
    const datedRows = new Map<string, BackupPlannerRow[]>()
    const undatedRows: BackupPlannerRow[] = []

    for (const day of trip.days) {
      datedRows.set(day.date, [])
    }

    for (const activity of backupActivities) {
      const targetRows = activity.tripDate ? datedRows.get(activity.tripDate) : undefined
      if (targetRows) {
        targetRows.push({ item: activity, type: "activity" })
      } else {
        undatedRows.push({ item: activity, type: "activity" })
      }
    }

    for (const meal of backupMeals) {
      const targetRows = meal.tripDate ? datedRows.get(meal.tripDate) : undefined
      if (targetRows) {
        targetRows.push({ item: meal, type: "meal" })
      } else {
        undatedRows.push({ item: meal, type: "meal" })
      }
    }

    const groups: DesktopBackupGroup[] = trip.days
      .map((day) => ({
        id: day.date,
        label: formatDate(day.date),
        rows: sortBackupPlannerRows(datedRows.get(day.date) ?? []),
        date: day.date,
      }))
      .filter((group) => group.rows.length > 0)

    if (undatedRows.length > 0) {
      groups.push({
        id: "undated",
        label: t("backup.noTentativeDate"),
        rows: sortBackupPlannerRows(undatedRows),
        date: null,
      })
    }

    return groups
  })()
  const desktopGroupById = new Map(desktopBackupGroups.map((group) => [group.id, group]))
  const desktopDropLineBounds = desktopTableRef.current?.getBoundingClientRect()
  const desktopDraggedItemKey = desktopDraggedItem ? getDraggedItemKey(desktopDraggedItem) : null
  const desktopDraggedSourceRows = desktopDraggedItem
    ? desktopGroupById.get(desktopDraggedItem.dayDate)?.rows ?? []
    : []
  const desktopDraggedSourceIndex = desktopDraggedItemKey
    ? desktopDraggedSourceRows.findIndex((row) => getItineraryRowKey(row) === desktopDraggedItemKey)
    : -1
  const isDesktopDropLineSuppressed =
    desktopDraggedSourceIndex >= 0 &&
    desktopDropTarget?.dayDate === desktopDraggedItem?.dayDate &&
    (desktopDropTarget?.index === desktopDraggedSourceIndex ||
      desktopDropTarget?.index === desktopDraggedSourceIndex + 1)

  function setDesktopDropTarget(nextTarget: SpreadsheetDropTarget | null) {
    desktopDropTargetRef.current = nextTarget
    setDesktopDropTargetState(nextTarget)
  }

  function getDesktopSourceGroupId(draggedKey: string) {
    if (desktopDraggedItem) {
      return desktopDraggedItem.dayDate
    }

    return desktopBackupGroups.find((group) =>
      group.rows.some((row) => getItineraryRowKey(row) === draggedKey),
    )?.id
  }

  function getOptimisticBackupTrip(
    baseTrip: TripDetail,
    rowsByGroupId: Map<string, BackupPlannerRow[]>,
  ): TripDetail {
    const activityUpdates = new Map<string, Activity>()
    const mealUpdates = new Map<string, Meal>()

    rowsByGroupId.forEach((rows, groupId) => {
      const group = desktopGroupById.get(groupId)
      if (!group) {
        return
      }

      rows.forEach((row, sortOrder) => {
        const update = {
          ...row.item,
          sortOrder,
          tripDate: group.date,
        }
        if (row.type === "activity") {
          activityUpdates.set(row.item.id, update as Activity)
        } else {
          mealUpdates.set(row.item.id, update as Meal)
        }
      })
    })

    return {
      ...baseTrip,
      backupActivities: baseTrip.backupActivities.map(
        (activity) => activityUpdates.get(activity.id) ?? activity,
      ),
      meals: baseTrip.meals.map((meal) => (meal.isBackup ? mealUpdates.get(meal.id) ?? meal : meal)),
    }
  }

  function handleDesktopDragStart(
    event: DragEvent<HTMLTableRowElement>,
    dayDate: string,
    row: BackupPlannerRow,
  ) {
    if (isDragBlockedTarget(event.target) || isSaving) {
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
    setDesktopDraggedItem({
      dayDate,
      itemId: row.item.id,
      itemType: row.type,
    })
  }

  function handleDesktopDragOver(event: DragEvent<HTMLTableRowElement>, dayDate: string) {
    if (!desktopDraggedItem) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const nextDropTarget = getNearestSpreadsheetDropTarget(
      desktopTableRef.current,
      dayDate,
      event.clientY,
    )
    const currentDropTarget = desktopDropTargetRef.current
    if (
      nextDropTarget &&
      (currentDropTarget?.dayDate !== nextDropTarget.dayDate ||
        currentDropTarget.index !== nextDropTarget.index ||
        currentDropTarget.lineY !== nextDropTarget.lineY)
    ) {
      setDesktopDropTarget(nextDropTarget)
    }
  }

  function handleDesktopDragEnd() {
    setDesktopDraggedItem(null)
    setDesktopDropTarget(null)
  }

  async function handleDesktopDrop(event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault()
    event.stopPropagation()

    const selectedDropTarget = desktopDropTargetRef.current
    const draggedKey = desktopDraggedItem
      ? getDraggedItemKey(desktopDraggedItem)
      : event.dataTransfer.getData("text/plain")
    setDesktopDraggedItem(null)
    setDesktopDropTarget(null)

    if (!draggedKey || !selectedDropTarget || isSaving) {
      return
    }

    const sourceGroupId = getDesktopSourceGroupId(draggedKey)
    const targetGroupId = selectedDropTarget.dayDate

    if (!sourceGroupId) {
      return
    }

    const sourceRows = desktopGroupById.get(sourceGroupId)?.rows ?? []
    const sourceIndex = sourceRows.findIndex((row) => getItineraryRowKey(row) === draggedKey)
    const targetRows = desktopGroupById.get(targetGroupId)?.rows ?? []

    if (sourceIndex < 0 || targetRows.length === 0) {
      return
    }

    const isSameGroup = sourceGroupId === targetGroupId
    const targetRowsWithoutDraggedItem = targetRows.filter(
      (row) => getItineraryRowKey(row) !== draggedKey,
    )
    const adjustedTargetIndex =
      isSameGroup && sourceIndex < selectedDropTarget.index
        ? selectedDropTarget.index - 1
        : selectedDropTarget.index
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

    if (isSameGroup && insertionIndex === sourceIndex) {
      return
    }

    const rowsByGroupId = new Map<string, BackupPlannerRow[]>()
    if (isSameGroup) {
      rowsByGroupId.set(sourceGroupId, nextTargetRows)
    } else {
      rowsByGroupId.set(
        sourceGroupId,
        sourceRows.filter((row) => getItineraryRowKey(row) !== draggedKey),
      )
      rowsByGroupId.set(targetGroupId, nextTargetRows)
    }

    const optimisticTrip = getOptimisticBackupTrip(trip, rowsByGroupId)
    onTripUpdated(optimisticTrip)
    setFormError(null)
    setIsSaving(true)

    try {
      const saveRequests = Array.from(rowsByGroupId.entries()).flatMap(([groupId, rows]) => {
        const group = desktopGroupById.get(groupId)
        if (!group) {
          return []
        }

        return rows.map((row, sortOrder) =>
          row.type === "activity"
            ? updateActivity(accessToken, trip.id, row.item.id, {
                sortOrder,
                tripDate: group.date,
              })
            : updateMeal(accessToken, trip.id, row.item.id, {
                sortOrder,
                tripDate: group.date,
              }),
        )
      })
      await Promise.all(saveRequests)
    } catch (reason: unknown) {
      onTripUpdated(trip)
      setFormError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  const sections: Array<{ type: BackupType; label: string; items: BackupItem[] }> = [
    { type: "activity", label: t("tripDetails.activities"), items: backupActivities },
    { type: "meal", label: t("tripDetails.meals"), items: backupMeals },
    { type: "housing", label: t("tripDetails.housing"), items: backupHousing },
  ]

  return (
    <section className="mt-2 grid gap-5 pb-24 lg:pb-0">
      <div>
        <div className="mt-4 lg:hidden">
          <label className="grid gap-1.5 text-sm font-medium text-muted">
            {t("backup.chooseType")}
            <select
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-ink"
              onChange={(event) => setSelectedType(event.target.value as BackupType)}
              value={selectedType}
            >
              {sections.map((section) => (
                <option key={section.type} value={section.type}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <TripDayNavigator
          days={trip.days}
          housingStays={trip.housingStays}
          includeBackupHousing
          onSelectAll={daySelection.onSelectAll}
          onSelectDay={daySelection.onSelectDay}
          onToggleDay={daySelection.onToggleDay}
          selectedDay={selectedDay}
          selectedDayDates={selectedDayDates}
        />
        <div className="min-w-0">
          <MobileDayPager
            days={trip.days}
            onSelectDate={(date) => daySelection.onSelectDay(date, false)}
            selectedDate={selectedDayDate}
          >
            <div>
              {!editingId && <div className="lg:hidden">{renderForm()}</div>}
              <div className="mt-5 grid gap-5 lg:hidden">
                {sections.map((section) => (
                  <section
                    className={selectedType === section.type ? "block" : "hidden"}
                    key={section.type}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-brand">{section.label}</h2>
                      <button
                        className="rounded-lg px-2 py-1 text-sm font-semibold text-on-surface hover:bg-surface-muted"
                        onClick={() => startCreate(section.type)}
                        type="button"
                      >
                        {t("tripDetails.add")}
                      </button>
                    </div>
                    {section.items.length === 0 ? (
                      <p className="mt-3 rounded-2xl border border-dashed border-border-dashed p-4 text-sm text-muted">
                        {t("backup.empty")}
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {section.items.map((item) => renderItem(section.type, item))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <div className="mt-5 hidden lg:block">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-text">
                      {t("spreadsheet.prototype")}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-brand">{t("spreadsheet.itinerary")}</h2>
                    <p className="mt-2 text-sm text-muted">{t("backup.subtitle")}</p>
                  </div>
                </div>
                <div className="relative mt-5 w-full overflow-x-auto">
                  <div className="w-full min-w-0 rounded-2xl border border-border-card bg-surface">
                    <table
                      className="w-full min-w-[56rem] table-fixed border-collapse text-left"
                      ref={desktopTableRef}
                    >
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
                      <thead className="sticky top-0 z-10 text-xs font-semibold uppercase tracking-wide text-muted">
                        <tr>
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
                        {desktopBackupGroups.length === 0 ? (
                          <tr>
                            <td
                              className="border-b border-border-divider px-3 py-4 text-sm text-muted"
                              colSpan={itineraryColumnCount}
                            >
                              {t("backup.empty")}
                            </td>
                          </tr>
                        ) : (
                          desktopBackupGroups.map((group) => (
                            <Fragment key={group.id}>
                              <tr
                                className="bg-page"
                                onDragOver={(event) => handleDesktopDragOver(event, group.id)}
                                onDrop={(event) => void handleDesktopDrop(event)}
                              >
                                <th
                                  className="border-y border-border-divider px-3 py-2 text-left text-sm font-semibold text-brand"
                                  colSpan={itineraryColumnCount}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{group.label}</span>
                                    <span className="flex flex-wrap gap-2 normal-case tracking-normal">
                                      <button
                                        className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
                                        disabled={isSaving}
                                        onClick={() => startDesktopCreate("activity", group)}
                                        type="button"
                                      >
                                        + {t("spreadsheet.addActivity")}
                                      </button>
                                      <button
                                        className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
                                        disabled={isSaving}
                                        onClick={() => startDesktopCreate("meal", group)}
                                        type="button"
                                      >
                                        + {t("spreadsheet.addMeal")}
                                      </button>
                                    </span>
                                  </div>
                                </th>
                              </tr>
                              {!editingId &&
                                formType !== "housing" &&
                                creatingDesktopGroupId === group.id && (
                                  <tr>
                                    <td className="border-b border-border-divider p-3" colSpan={itineraryColumnCount}>
                                      {renderForm()}
                                    </td>
                                  </tr>
                                )}
                              {group.rows.map(({ type, item }, itemIndex) => {
                                const key = `${type}:${item.id}`
                                const displayedDate = item.tripDate
                                  ? formatDate(item.tripDate)
                                  : t("backup.noTentativeDate")
                                const activeField = desktopEditingFieldKey?.startsWith(`${key}:`)
                                  ? (desktopEditingFieldKey.slice(key.length + 1) as EditableField)
                                  : null
                                  const defaultEndTimeForStart =
                                    activeField === "startTime" && desktopDraft && !desktopDraft.endTime
                                      ? getDefaultEndTimeForStart(group.rows, desktopDraft.startTime, key)
                                      : null

                                  return (
                                    <SpreadsheetItineraryRow
                                    key={key}
                                    activeField={activeField}
                                    dateLabel={displayedDate}
                                    dayDate={group.id}
                                    draft={desktopDraft}
                                    isHousingEditing={false}
                                    isSaving={isSaving}
                                    item={item}
                                    itemIndex={itemIndex}
                                    itineraryColumnCount={itineraryColumnCount}
                                    moveActionLabel={t("backup.moveToPlan")}
                                    onCancelEditing={cancelDesktopEditing}
                                    onDragEnd={handleDesktopDragEnd}
                                    onDragOver={handleDesktopDragOver}
                                    onDragStart={handleDesktopDragStart}
                                    onDrop={handleDesktopDrop}
                                    defaultEndTimeForStart={defaultEndTimeForStart}
                                    onMoveToBackup={(rowType, rowItem) => {
                                      void moveToPlan({ item: rowItem, type: rowType })
                                    }}
                                    onPreferenceChange={(itemType, itemId, value) => {
                                      void handlePreferenceChange(itemType, itemId, value)
                                    }}
                                    onSaveField={(rowType, rowItem, field, nextDraft) => {
                                      void saveDesktopEditingField(rowType, rowItem, field, nextDraft)
                                    }}
                                    onSaveGoogleMapsUrl={saveBackupItemGoogleMapsUrl}
                                    onSetPendingDeletion={(deletion) => setPendingDeletion(deletion)}
                                    onStartEditing={startDesktopEditing}
                                    onUpdateDraft={setDesktopDraft}
                                    preferences={trip.preferences}
                                    saveError={desktopSaveError}
                                    savingPreferenceKey={savingPreferenceKey}
                                    showPrice={showPrice}
                                    showWebsite={showWebsite}
                                    type={type}
                                    userId={userId}
                                  />
                                )
                              })}
                            </Fragment>
                          ))
                        )}
                      </tbody>
                    </table>
                    {desktopDropLineBounds &&
                      desktopDropTarget &&
                      desktopDraggedItem &&
                      !isDesktopDropLineSuppressed &&
                      createPortal(
                        <div
                          aria-hidden="true"
                          className="pointer-events-none fixed z-30 h-0.5 bg-brand shadow-sm"
                          data-drop-indicator
                          style={{
                            left: desktopDropLineBounds.left,
                            top: desktopDropTarget.lineY - 1,
                            width: desktopDropLineBounds.width,
                          }}
                        />,
                        document.body,
                      )}
                  </div>
                </div>
              </div>
            </div>
          </MobileDayPager>
        </div>
      </div>
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        isConfirming={deletingKey !== null}
        isOpen={pendingDeletion !== null}
        message={t("backup.deleteConfirmation")}
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => {
          if (pendingDeletion) {
            void handleDelete(pendingDeletion)
          }
        }}
        title={t("common.confirmDeletionTitle")}
      />
    </section>
  )
}
