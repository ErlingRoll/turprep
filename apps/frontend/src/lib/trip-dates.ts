import { getTripDurationInDays, MAX_TRIP_DAYS } from "@turprep/models"
import i18n from "../i18n"

export function shiftDate(date: string, dayOffset: number) {
  const parsedDate = new Date(`${date}T12:00:00Z`)
  parsedDate.setUTCDate(parsedDate.getUTCDate() + dayOffset)
  return parsedDate.toISOString().slice(0, 10)
}

export function getTripDurationMessage(startDate: string, endDate: string) {
  const duration = getTripDurationInDays(startDate, endDate)
  return duration && duration > MAX_TRIP_DAYS
    ? i18n.t("errors.tripTooLong", { maxDays: MAX_TRIP_DAYS })
    : null
}
