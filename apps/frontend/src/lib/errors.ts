import { MAX_TRIP_DAYS } from "@turprep/models"
import i18n from "../i18n"
import { HttpError, markHttpErrorHandled } from "./http-errors"

const errorTranslations: Record<string, string> = {
  "Authentication required": "errors.authenticationRequired",
  "Invalid authentication token": "errors.invalidAuthentication",
  "Invalid trip data": "errors.invalidTripData",
  "The trip end date must be on or after the start date": "errors.tripDatesInvalid",
  "Trips cannot be longer than 60 days": "errors.tripTooLong",
  "Trip not found": "errors.tripNotFound",
  "Invalid activity data": "errors.invalidActivityData",
  "The activity date must be within the trip dates": "errors.activityOutsideTrip",
  "Activity not found": "errors.activityNotFound",
  "Route not found": "errors.routeNotFound",
  "Internal server error": "errors.internalServer",
  "Google Maps link is invalid": "errors.googleMapsInvalid",
  "Could not resolve Google Maps link": "errors.googleMapsResolveFailed",
  "No place found for Google Maps link": "errors.googleMapsPlaceNotFound",
  "Google Places is not configured": "errors.googlePlacesUnavailable",
}

const validationIssueTranslations: Record<string, string> = {
  "An activity title or Google Maps link is required": "errors.activityTitleOrGoogleMapsRequired",
  "A planned activity must have a date": "errors.activityOutsideTrip",
  "End time must be on or after start time": "spreadsheet.endBeforeStartError",
  "A price amount and currency must be provided together": "errors.priceAmountCurrencyPairRequired",
}

const googleMapsErrorMessages = new Set([
  "Google Maps link is invalid",
  "Could not resolve Google Maps link",
  "No place found for Google Maps link",
  "Google Places is not configured",
])

export function isGoogleMapsError(reason: unknown) {
  return reason instanceof Error && googleMapsErrorMessages.has(reason.message)
}

export function getErrorMessage(reason: unknown) {
  markHttpErrorHandled(reason)

  if (!(reason instanceof Error)) {
    return i18n.t("errors.generic")
  }

  const translationKey = errorTranslations[reason.message]

  if (reason instanceof HttpError && reason.issues?.length) {
    const firstIssue = reason.issues[0]
    if (firstIssue?.message) {
      const issueTranslationKey = validationIssueTranslations[firstIssue.message]
      if (issueTranslationKey) {
        return i18n.t(issueTranslationKey)
      }

      if (import.meta.env.DEV) {
        return firstIssue.message
      }
    }
  }

  if (!translationKey) {
    if (import.meta.env.DEV && reason instanceof HttpError) {
      return reason.message
    }

    return i18n.t("errors.generic")
  }

  if (translationKey === "errors.tripTooLong") {
    return i18n.t(translationKey, { maxDays: MAX_TRIP_DAYS })
  }

  return i18n.t(translationKey)
}
