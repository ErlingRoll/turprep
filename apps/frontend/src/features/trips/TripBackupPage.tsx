import { useEffect, useState, type FormEvent } from "react"
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
import type { ItemDetailValues } from "../../components/ItemDetails"
import { getErrorMessage, isGoogleMapsError } from "../../lib/errors"
import { getDefaultCurrency } from "../../lib/currency"
import { formatActivityTime, getDayItemTitle, sortActivities } from "../../lib/activity-format"
import { formatDate } from "../../lib/date-format"
import { shiftDate } from "../../lib/trip-dates"
import { TripDayNavigator } from "./TripDayNavigator"
import type { TripDaySelection } from "./useTripDaySelection"
import {
  isAllowedGoogleMapsUrl,
  type TripItemPreferenceValue,
  type TripItemType,
} from "@turprep/models"

type BackupType = "activity" | "meal" | "housing"
type BackupItem = Activity | Meal | HousingStay
type BackupEntry = { type: BackupType; item: BackupItem }

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
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")
    const handleChange = () => setIsDesktop(mediaQuery.matches)

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

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
    isDesktop && !areAllDaysSelected
      ? allBackupActivities.filter((activity) => isDateSelected(activity.tripDate))
      : allBackupActivities,
  )
  const backupMeals =
    isDesktop && !areAllDaysSelected
      ? allBackupMeals.filter((meal) => isDateSelected(meal.tripDate))
      : allBackupMeals
  const backupHousing =
    isDesktop && !areAllDaysSelected ? allBackupHousing.filter(isHousingSelected) : allBackupHousing

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
  }

  function startCreate(type: BackupType) {
    resetForm()
    setFormType(type)
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
    if (value && !endTime) {
      setEndTime(value)
    }
  }

  function handleEndTimeChange(value: string) {
    setEndTime(value)
    if (value && !startTime) {
      setStartTime(value)
    }
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
                  <TimePicker
                    label={t("common.to")}
                    onChange={handleEndTimeChange}
                    value={endTime}
                  />
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

  const sections: Array<{ type: BackupType; label: string; items: BackupItem[] }> = [
    { type: "activity", label: t("tripDetails.activities"), items: backupActivities },
    { type: "meal", label: t("tripDetails.meals"), items: backupMeals },
    { type: "housing", label: t("tripDetails.housing"), items: backupHousing },
  ]

  return (
    <section className="mt-6 grid gap-5">
      <div>
        <p className="text-sm text-muted">{t("backup.subtitle")}</p>
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
          {!editingId && renderForm()}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {sections.map((section) => (
              <section
                className={`${selectedType === section.type ? "block" : "hidden"} lg:block`}
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
