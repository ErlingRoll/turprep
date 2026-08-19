import type { Trip } from "@turprep/models"
import i18n, { getDateLocale } from "../i18n"

export function formatDate(date: string) {
  return new Intl.DateTimeFormat(getDateLocale(i18n.language), {
    dateStyle: "medium",
  }).format(new Date(`${date}T12:00:00`))
}

export function formatLongDate(date: string) {
  return new Intl.DateTimeFormat(getDateLocale(i18n.language), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`))
}

export function formatDateRange(trip: Pick<Trip, "startDate" | "endDate">) {
  return `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
}
