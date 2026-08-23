import { MAX_TRIP_DAYS } from "@turprep/models"
import i18n from "../i18n"
import { HttpError, markHttpErrorHandled } from "./http-errors"

const errorTranslations: Record<string, string> = {
  "Accepted currencies must be unique": "errors.acceptedCurrenciesUnique",
  "Access link id is required": "errors.accessLinkIdRequired",
  "Access link not found": "errors.accessLinkNotFound",
  "Access request id is required": "errors.accessRequestIdRequired",
  "Access request not found": "errors.accessRequestNotFound",
  "Activity ids must be unique": "errors.activityIdsUnique",
  "Authentication required": "errors.authenticationRequired",
  "Day item date must be within the trip dates": "errors.dayItemDateOutsideTrip",
  "Day item ids must be unique": "errors.dayItemIdsUnique",
  "Day item not found": "errors.dayItemNotFound",
  "Day not found": "errors.dayNotFound",
  "Google place photo is invalid": "errors.googlePhotoInvalid",
  "Invalid authentication token": "errors.invalidAuthentication",
  "Invalid access request data": "errors.invalidAccessRequestData",
  "Invalid trip data": "errors.invalidTripData",
  "Invalid activity data": "errors.invalidActivityData",
  "Invalid activity order data": "errors.invalidActivityOrderData",
  "Invalid currency settings": "errors.invalidCurrencySettings",
  "Invalid day data": "errors.invalidDayData",
  "Invalid day item order data": "errors.invalidDayItemOrderData",
  "Invalid housing data": "errors.invalidHousingData",
  "Invalid invitation data": "errors.invalidInvitationData",
  "Invalid meal data": "errors.invalidMealData",
  "Invalid preference data": "errors.invalidPreferenceData",
  "Invalid visibility settings": "errors.invalidVisibilitySettings",
  "Invitation id is required": "errors.invitationIdRequired",
  "Invitation not found": "errors.invitationNotFound",
  "Invitation or access link not found": "errors.invitationOrAccessLinkNotFound",
  "Meal not found": "errors.mealNotFound",
  "Member id is required": "errors.memberIdRequired",
  "Member not found": "errors.memberNotFound",
  "The trip end date must be on or after the start date": "errors.tripDatesInvalid",
  "Trips cannot be longer than 60 days": "errors.tripTooLong",
  "The new trip dates cannot exclude existing activities": "errors.tripDatesExcludeActivities",
  "The day must be within the trip dates": "errors.dayOutsideTrip",
  "The meal date must be within the trip dates": "errors.mealOutsideTrip",
  "Timed day items must be ordered by start time": "errors.timedItemsOutOfOrder",
  "Trip and activity ids are required": "errors.tripActivityIdsRequired",
  "Trip and housing ids are required": "errors.tripHousingIdsRequired",
  "Trip and meal ids are required": "errors.tripMealIdsRequired",
  "Trip id and date are required": "errors.tripIdAndDateRequired",
  "Trip id is required": "errors.tripIdRequired",
  "Trip item not found": "errors.tripItemNotFound",
  "Trip item preference has no associated item": "errors.tripItemPreferenceInvalid",
  "Trip not found": "errors.tripNotFound",
  "Housing stay not found": "errors.housingNotFound",
  "Route not found": "errors.routeNotFound",
  "Activity not found": "errors.activityNotFound",
  "A price amount and currency must be provided together": "errors.priceAmountCurrencyPairRequired",
  "Internal server error": "errors.internalServer",
  "Google Maps link is invalid": "errors.googleMapsInvalid",
  "Could not resolve Google Maps link": "errors.googleMapsResolveFailed",
  "No place found for Google Maps link": "errors.googleMapsPlaceNotFound",
  "Google Places is not configured": "errors.googlePlacesUnavailable",
  "Invalid login credentials": "errors.invalidLoginCredentials",
  "Email not confirmed": "errors.emailNotConfirmed",
  "User already registered": "errors.userAlreadyRegistered",
  "Password should be at least 6 characters": "errors.passwordTooShort",
  "Unable to validate email address: invalid format": "errors.invalidEmail",
}

const validationIssueTranslations: Record<string, string> = {
  "A housing stay must have a name or Google Maps link": "errors.housingNameOrGoogleMapsRequired",
  "A planned housing stay must have a valid date range": "errors.housingDatesInvalid",
  "An activity title or Google Maps link is required": "errors.activityTitleOrGoogleMapsRequired",
  "A meal title or Google Maps link is required": "errors.mealTitleOrGoogleMapsRequired",
  "A planned activity must have a date": "errors.activityOutsideTrip",
  "A planned meal must have a date": "errors.mealOutsideTrip",
  "Accepted currencies must be unique": "errors.acceptedCurrenciesUnique",
  "End time must be on or after start time": "spreadsheet.endBeforeStartError",
  "Check-out must be after check-in": "errors.housingCheckoutInvalid",
  "Price amount must have at most two decimal places": "errors.pricePrecisionInvalid",
  "A price amount and currency must be provided together": "errors.priceAmountCurrencyPairRequired",
}

const googleMapsErrorMessages = new Set([
  "Google Maps link is invalid",
  "Could not resolve Google Maps link",
  "No place found for Google Maps link",
  "Google Places is not configured",
])

const connectionErrorMessages = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
])

export function isGoogleMapsError(reason: unknown) {
  return reason instanceof Error && googleMapsErrorMessages.has(reason.message)
}

export function getErrorMessage(reason: unknown) {
  markHttpErrorHandled(reason)

  if (!(reason instanceof Error)) {
    return i18n.t("errors.generic")
  }

  if (connectionErrorMessages.has(reason.message)) {
    return i18n.t("errors.connectionFailed")
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
    if (
      import.meta.env.DEV &&
      reason instanceof HttpError &&
      !/^API request failed \(\d+\)$/.test(reason.message)
    ) {
      return reason.message
    }

    if (reason instanceof HttpError) {
      const statusTranslationKeys: Record<number, string> = {
        400: "errors.requestInvalid",
        401: "errors.authenticationRequired",
        403: "errors.requestForbidden",
        404: "errors.requestNotFound",
        409: "errors.requestConflict",
        429: "errors.requestRateLimited",
      }
      const statusTranslationKey =
        statusTranslationKeys[reason.status] ??
        (reason.status >= 500 ? "errors.serverUnavailable" : "errors.generic")

      return i18n.t(statusTranslationKey)
    }

    return i18n.t("errors.generic")
  }

  if (translationKey === "errors.tripTooLong") {
    return i18n.t(translationKey, { maxDays: MAX_TRIP_DAYS })
  }

  return i18n.t(translationKey)
}
