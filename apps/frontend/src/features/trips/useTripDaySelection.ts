import { useEffect, useState } from "react"
import type { TripDetail } from "../../api"
import { storageKeys } from "../../lib/brand"

const daySelectionCookieMaxAge = 60 * 60 * 24 * 365

function getDaySelectionCookieName(tripId: string) {
  return `${storageKeys.selectedDaysPrefix}${tripId}`
}

function getLegacyDaySelectionCookieName(tripId: string) {
  return `${storageKeys.legacySelectedDaysPrefix}${tripId}`
}

function writeSelectedDayDates(tripId: string, selectedDates: string[]) {
  document.cookie = [
    `${getDaySelectionCookieName(tripId)}=${encodeURIComponent(JSON.stringify(selectedDates))}`,
    `max-age=${daySelectionCookieMaxAge}`,
    "path=/",
    "samesite=lax",
  ].join("; ")
}

function readSelectedDayDates(tripId: string, validDates: string[]) {
  const cookieName = getDaySelectionCookieName(tripId)
  const legacyCookieName = getLegacyDaySelectionCookieName(tripId)
  const cookie =
    document.cookie.split("; ").find((entry) => entry.startsWith(`${cookieName}=`)) ??
    document.cookie.split("; ").find((entry) => entry.startsWith(`${legacyCookieName}=`))
  const storedCookieName = cookie?.startsWith(`${cookieName}=`) ? cookieName : legacyCookieName

  if (!cookie) {
    return null
  }

  try {
    const storedDates: unknown = JSON.parse(
      decodeURIComponent(cookie.slice(storedCookieName.length + 1)),
    )

    if (
      !Array.isArray(storedDates) ||
      !storedDates.every((date): date is string => typeof date === "string")
    ) {
      return null
    }

    const selectedDates = storedDates.filter((date) => validDates.includes(date))

    if (storedCookieName === legacyCookieName) {
      writeSelectedDayDates(tripId, selectedDates)
    }

    return selectedDates
  } catch {
    return null
  }
}

export type TripDaySelection = {
  selectedDayDate: string
  selectedDayDates: string[]
  onSelectAll: () => void
  onSelectDay: (date: string, shiftKey: boolean) => void
  onToggleDay: (date: string, shiftKey: boolean) => void
}

export function useTripDaySelection(trip: TripDetail | null): TripDaySelection {
  const [selectedDayDate, setSelectedDayDate] = useState("")
  const [selectedDayDates, setSelectedDayDates] = useState<string[]>([])
  const [lastClickedDayDate, setLastClickedDayDate] = useState("")

  useEffect(() => {
    if (!trip) {
      return
    }

    const validDates = trip.days.map((day) => day.date)
    const persistedDates = readSelectedDayDates(trip.id, validDates)

    setSelectedDayDates(persistedDates ?? validDates)
    setSelectedDayDate((currentDate) =>
      validDates.includes(currentDate) ? currentDate : (validDates[0] ?? ""),
    )
    setLastClickedDayDate((currentDate) =>
      validDates.includes(currentDate) ? currentDate : (validDates[0] ?? ""),
    )
  }, [trip])

  function getDayRange(startDate: string, endDate: string) {
    if (!trip) {
      return [endDate]
    }

    const startIndex = trip.days.findIndex((day) => day.date === startDate)
    const endIndex = trip.days.findIndex((day) => day.date === endDate)

    if (startIndex < 0 || endIndex < 0) {
      return [endDate]
    }

    const rangeStart = Math.min(startIndex, endIndex)
    const rangeEnd = Math.max(startIndex, endIndex)
    return trip.days.slice(rangeStart, rangeEnd + 1).map((day) => day.date)
  }

  function onSelectDay(date: string, shiftKey: boolean) {
    if (!trip) {
      return
    }

    const dates = shiftKey && lastClickedDayDate ? getDayRange(lastClickedDayDate, date) : [date]
    setSelectedDayDate(date)
    setSelectedDayDates(dates)
    setLastClickedDayDate(date)
    writeSelectedDayDates(trip.id, dates)
  }

  function onToggleDay(date: string, shiftKey: boolean) {
    if (!trip) {
      return
    }

    if (shiftKey && lastClickedDayDate) {
      const dates = getDayRange(lastClickedDayDate, date)
      setSelectedDayDate(date)
      setSelectedDayDates(dates)
      setLastClickedDayDate(date)
      writeSelectedDayDates(trip.id, dates)
      return
    }

    // Compute outside the state updater: updaters must stay pure (StrictMode
    // double-invokes them), and nested setState calls inside them are unsupported.
    const nextDates = selectedDayDates.includes(date)
      ? selectedDayDates.filter((currentDate) => currentDate !== date)
      : [...selectedDayDates, date]

    setSelectedDayDates(nextDates)
    setLastClickedDayDate(date)
    writeSelectedDayDates(trip.id, nextDates)

    if (nextDates.length > 0 && !nextDates.includes(selectedDayDate)) {
      setSelectedDayDate(nextDates[0])
    }
  }

  function onSelectAll() {
    if (!trip) {
      return
    }

    const allDates = trip.days.map((day) => day.date)
    setSelectedDayDates(allDates)
    writeSelectedDayDates(trip.id, allDates)
  }

  return {
    selectedDayDate,
    selectedDayDates,
    onSelectAll,
    onSelectDay,
    onToggleDay,
  }
}
