import {
  ActivitySchema,
  CreateActivityInputSchema,
  CreateHousingStayInputSchema,
  CreateMealInputSchema,
  GooglePlaceDetailsSchema,
  GooglePlaceSuggestionsInputSchema,
  GooglePlaceSuggestionsSchema,
  HousingStaySchema,
  MealSchema,
  TripDetailSchema,
  ReorderActivitiesInputSchema,
  ReorderDayItemsInputSchema,
  ReorderedDayItemsSchema,
  SetTripItemPreferenceInputSchema,
  InviteTripMemberInputSchema,
  RequestTripAccessInputSchema,
  TripAccessLinkSchema,
  TripAccessRequestSchema,
  TripAccessStatusSchema,
  TripInvitationSchema,
  TripMemberSchema,
  TripSharingSchema,
  TripItemPreferenceSchema,
  TripCurrencySettingsSchema,
  TripItemDetailVisibilitySchema,
  TripDaySchema,
  TripSchema,
  UpdateHousingStayInputSchema,
  UpdateMealInputSchema,
  UpdateTripInputSchema,
  UpdateActivityInputSchema,
  UpdateTripCurrencySettingsInputSchema,
  UpdateTripItemDetailVisibilityInputSchema,
  type Activity,
  type CreateActivityInput,
  type CreateHousingStayInput,
  type CreateMealInput,
  type GooglePlaceDetails,
  type GooglePlaceSuggestionsInput,
  type GooglePlaceSuggestion,
  type CreateTripInput,
  type HousingStay,
  type Meal,
  type Trip,
  type TripDetail,
  type UpdateHousingStayInput,
  type UpdateMealInput,
  type UpdateTripDayInput,
  type UpdateTripInput,
  type UpdateActivityInput,
  type ReorderActivityInput,
  type ReorderDayItemInput,
  type InviteTripMemberInput,
  type RequestTripAccessInput,
  type TripAccessLink,
  type TripAccessRequest,
  type TripAccessStatus,
  type TripInvitation,
  type TripMember,
  type TripSharing,
  type SetTripItemPreferenceInput,
  type TripItemPreference,
  type TripCurrencySettings,
  type UpdateTripCurrencySettingsInput,
  type TripItemDetailVisibility,
  type UpdateTripItemDetailVisibilityInput,
} from "@turprep/models"
import { HttpError, notifyUnhandledHttpError } from "./lib/http-errors"

const googlePlaceSuggestionsCacheTtlMs = 60 * 60 * 1000
const googlePlaceSuggestionsCache = new Map<
  string,
  { expiresAt: number; promise: Promise<GooglePlaceSuggestion[]> }
>()
const googlePlacePhotoCacheTtlMs = 60 * 60 * 1000
const googlePlacePhotoCache = new Map<string, { expiresAt: number; promise: Promise<Blob> }>()

export type {
  Activity,
  CreateActivityInput,
  CreateTripInput,
  CreateHousingStayInput,
  CreateMealInput,
  GooglePlaceDetails,
  GooglePlaceSuggestionsInput,
  GooglePlaceSuggestion,
  HousingStay,
  Meal,
  Trip,
  TripDetail,
  UpdateHousingStayInput,
  UpdateMealInput,
  UpdateTripDayInput,
  UpdateTripInput,
  UpdateActivityInput,
  ReorderActivityInput,
  ReorderDayItemInput,
  InviteTripMemberInput,
  RequestTripAccessInput,
  TripAccessLink,
  TripAccessRequest,
  TripAccessStatus,
  TripInvitation,
  TripMember,
  TripSharing,
  SetTripItemPreferenceInput,
  TripItemPreference,
  TripCurrencySettings,
  UpdateTripCurrencySettingsInput,
  TripItemDetailVisibility,
  UpdateTripItemDetailVisibilityInput,
} from "@turprep/models"

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ""

async function request(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = `API request failed (${response.status})`
    let issues: Array<{ message?: string; path?: Array<string | number> }> | null = null

    try {
      const errorBody = (await response.json()) as {
        message?: string
        issues?: Array<{ message?: string; path?: Array<string | number> }>
      }
      message = errorBody.message ?? message
      issues = Array.isArray(errorBody.issues) ? errorBody.issues : null
    } catch {
      // Keep the status-based message when the server does not return JSON.
    }

    const error = new HttpError(message, response.status, issues)
    notifyUnhandledHttpError(error)
    throw error
  }

  return response.status === 204 ? null : (response.json() as Promise<unknown>)
}

async function requestBlob(path: string, accessToken: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    let message = `API request failed (${response.status})`

    try {
      const errorBody = (await response.json()) as { message?: string }
      message = errorBody.message ?? message
    } catch {
      // Keep the status-based message when the server does not return JSON.
    }

    const error = new HttpError(message, response.status)
    notifyUnhandledHttpError(error)
    throw error
  }

  return response.blob()
}

export async function getTrips(accessToken: string): Promise<Trip[]> {
  return TripSchema.array().parse(await request("/api/trips", accessToken))
}

export async function getGooglePlaceDetails(
  accessToken: string,
  googleMapsUrl: string,
): Promise<GooglePlaceDetails> {
  return GooglePlaceDetailsSchema.parse(
    await request("/api/google-places/details", accessToken, {
      body: JSON.stringify({ googleMapsUrl }),
      method: "POST",
    }),
  )
}

export async function getGooglePlaceSuggestions(
  accessToken: string,
  input: GooglePlaceSuggestionsInput,
): Promise<GooglePlaceSuggestion[]> {
  const validatedInput = GooglePlaceSuggestionsInputSchema.parse(input)
  const cacheKey = `${accessToken}:${JSON.stringify(validatedInput)}`
  const cached = googlePlaceSuggestionsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = request("/api/google-places/suggestions", accessToken, {
      body: JSON.stringify(validatedInput),
      method: "POST",
    }).then((response) => GooglePlaceSuggestionsSchema.parse(response))

  googlePlaceSuggestionsCache.set(cacheKey, {
    expiresAt: Date.now() + googlePlaceSuggestionsCacheTtlMs,
    promise,
  })
  void promise.catch(() => {
    if (googlePlaceSuggestionsCache.get(cacheKey)?.promise === promise) {
      googlePlaceSuggestionsCache.delete(cacheKey)
    }
  })

  return promise
}

export async function getGooglePlacePhoto(
  accessToken: string,
  photoName: string,
): Promise<Blob> {
  const cacheKey = `${accessToken}:${photoName}`
  const cached = googlePlacePhotoCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = requestBlob(
    `/api/google-places/photo?name=${encodeURIComponent(photoName)}`,
    accessToken,
  )
  googlePlacePhotoCache.set(cacheKey, {
    expiresAt: Date.now() + googlePlacePhotoCacheTtlMs,
    promise,
  })
  void promise.catch(() => {
    if (googlePlacePhotoCache.get(cacheKey)?.promise === promise) {
      googlePlacePhotoCache.delete(cacheKey)
    }
  })

  return promise
}

export async function getTrip(accessToken: string, tripId: string): Promise<TripDetail> {
  return TripDetailSchema.parse(await request(`/api/trips/${tripId}`, accessToken))
}

export async function getTripCurrencies(
  accessToken: string,
  tripId: string,
): Promise<TripCurrencySettings> {
  return TripCurrencySettingsSchema.parse(
    await request(`/api/trips/${tripId}/currencies`, accessToken),
  )
}

export async function updateTripCurrencies(
  accessToken: string,
  tripId: string,
  input: UpdateTripCurrencySettingsInput,
): Promise<TripCurrencySettings> {
  return TripCurrencySettingsSchema.parse(
    await request(`/api/trips/${tripId}/currencies`, accessToken, {
      method: "PUT",
      body: JSON.stringify(UpdateTripCurrencySettingsInputSchema.parse(input)),
    }),
  )
}

export async function updateTripItemDetailVisibility(
  accessToken: string,
  tripId: string,
  input: UpdateTripItemDetailVisibilityInput,
): Promise<TripItemDetailVisibility> {
  return TripItemDetailVisibilitySchema.parse(
    await request(`/api/trips/${tripId}/item-detail-visibility`, accessToken, {
      method: "PUT",
      body: JSON.stringify(UpdateTripItemDetailVisibilityInputSchema.parse(input)),
    }),
  )
}

export async function setTripItemPreference(
  accessToken: string,
  tripId: string,
  input: SetTripItemPreferenceInput,
): Promise<TripItemPreference | null> {
  return TripItemPreferenceSchema.nullable().parse(
    await request(`/api/trips/${tripId}/preferences`, accessToken, {
      method: "PUT",
      body: JSON.stringify(SetTripItemPreferenceInputSchema.parse(input)),
    }),
  )
}

export async function getTripSharing(accessToken: string, tripId: string): Promise<TripSharing> {
  return TripSharingSchema.parse(await request(`/api/trips/${tripId}/sharing`, accessToken))
}

export async function getTripAccessStatus(
  accessToken: string,
  tripId: string,
): Promise<TripAccessStatus> {
  return TripAccessStatusSchema.parse(
    await request(`/api/trips/${tripId}/sharing/access-status`, accessToken),
  )
}

export async function createTripInvitation(
  accessToken: string,
  tripId: string,
  input: InviteTripMemberInput,
): Promise<TripInvitation> {
  return TripInvitationSchema.parse(
    await request(`/api/trips/${tripId}/sharing/invitations`, accessToken, {
      method: "POST",
      body: JSON.stringify(InviteTripMemberInputSchema.parse(input)),
    }),
  )
}

export async function createTripAccessLink(
  accessToken: string,
  tripId: string,
): Promise<TripAccessLink> {
  return TripAccessLinkSchema.parse(
    await request(`/api/trips/${tripId}/sharing/access-links`, accessToken, {
      method: "POST",
    }),
  )
}

export async function requestTripAccess(
  accessToken: string,
  tripId: string,
  input: RequestTripAccessInput,
): Promise<TripAccessStatus> {
  return TripAccessStatusSchema.parse(
    await request(`/api/trips/${tripId}/sharing/access-requests`, accessToken, {
      method: "POST",
      body: JSON.stringify(RequestTripAccessInputSchema.parse(input)),
    }),
  )
}

export async function approveTripAccessRequest(
  accessToken: string,
  tripId: string,
  requestId: string,
): Promise<TripMember> {
  return TripMemberSchema.parse(
    await request(`/api/trips/${tripId}/sharing/requests/${requestId}/approve`, accessToken, {
      method: "PATCH",
    }),
  )
}

export async function denyTripAccessRequest(
  accessToken: string,
  tripId: string,
  requestId: string,
): Promise<TripAccessRequest> {
  return TripAccessRequestSchema.parse(
    await request(`/api/trips/${tripId}/sharing/requests/${requestId}/deny`, accessToken, {
      method: "PATCH",
    }),
  )
}

export async function revokeTripInvitation(
  accessToken: string,
  tripId: string,
  invitationId: string,
): Promise<TripInvitation> {
  return TripInvitationSchema.parse(
    await request(`/api/trips/${tripId}/sharing/invitations/${invitationId}/revoke`, accessToken, {
      method: "PATCH",
    }),
  )
}

export async function revokeTripAccessLink(
  accessToken: string,
  tripId: string,
  linkId: string,
): Promise<TripAccessLink> {
  return TripAccessLinkSchema.parse(
    await request(`/api/trips/${tripId}/sharing/access-links/${linkId}/revoke`, accessToken, {
      method: "PATCH",
    }),
  )
}

export async function removeTripMember(
  accessToken: string,
  tripId: string,
  memberId: string,
): Promise<void> {
  await request(`/api/trips/${tripId}/sharing/members/${memberId}`, accessToken, {
    method: "DELETE",
  })
}

export async function createTrip(accessToken: string, input: CreateTripInput): Promise<Trip> {
  return TripSchema.parse(
    await request("/api/trips", accessToken, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  )
}

export async function deleteTrip(accessToken: string, tripId: string): Promise<void> {
  await request(`/api/trips/${tripId}`, accessToken, {
    method: "DELETE",
  })
}

export async function updateTripDay(
  accessToken: string,
  tripId: string,
  tripDate: string,
  input: UpdateTripDayInput,
): Promise<TripDetail["days"][number]> {
  return TripDaySchema.parse(
    await request(`/api/trips/${tripId}/days/${tripDate}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  )
}

export async function updateTrip(
  accessToken: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<TripDetail> {
  return TripDetailSchema.parse(
    await request(`/api/trips/${tripId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(UpdateTripInputSchema.parse(input)),
    }),
  )
}

export async function createHousingStay(
  accessToken: string,
  tripId: string,
  input: CreateHousingStayInput,
): Promise<HousingStay> {
  return HousingStaySchema.parse(
    await request(`/api/trips/${tripId}/housing`, accessToken, {
      method: "POST",
      body: JSON.stringify(CreateHousingStayInputSchema.parse(input)),
    }),
  )
}

export async function updateHousingStay(
  accessToken: string,
  tripId: string,
  housingStayId: string,
  input: UpdateHousingStayInput,
): Promise<HousingStay> {
  return HousingStaySchema.parse(
    await request(`/api/trips/${tripId}/housing/${housingStayId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(UpdateHousingStayInputSchema.parse(input)),
    }),
  )
}

export async function deleteHousingStay(
  accessToken: string,
  tripId: string,
  housingStayId: string,
): Promise<void> {
  await request(`/api/trips/${tripId}/housing/${housingStayId}`, accessToken, {
    method: "DELETE",
  })
}

export async function createMeal(
  accessToken: string,
  tripId: string,
  input: CreateMealInput,
): Promise<Meal> {
  return MealSchema.parse(
    await request(`/api/trips/${tripId}/meals`, accessToken, {
      method: "POST",
      body: JSON.stringify(CreateMealInputSchema.parse(input)),
    }),
  )
}

export async function updateMeal(
  accessToken: string,
  tripId: string,
  mealId: string,
  input: UpdateMealInput,
): Promise<Meal> {
  return MealSchema.parse(
    await request(`/api/trips/${tripId}/meals/${mealId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(UpdateMealInputSchema.parse(input)),
    }),
  )
}

export async function deleteMeal(
  accessToken: string,
  tripId: string,
  mealId: string,
): Promise<void> {
  await request(`/api/trips/${tripId}/meals/${mealId}`, accessToken, {
    method: "DELETE",
  })
}

export async function createActivity(
  accessToken: string,
  tripId: string,
  input: CreateActivityInput,
): Promise<Activity> {
  return ActivitySchema.parse(
    await request(`/api/trips/${tripId}/activities`, accessToken, {
      method: "POST",
      body: JSON.stringify(CreateActivityInputSchema.parse(input)),
    }),
  )
}

export async function updateActivity(
  accessToken: string,
  tripId: string,
  activityId: string,
  input: UpdateActivityInput,
): Promise<Activity> {
  return ActivitySchema.parse(
    await request(`/api/trips/${tripId}/activities/${activityId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(UpdateActivityInputSchema.parse(input)),
    }),
  )
}

export async function reorderActivities(
  accessToken: string,
  tripId: string,
  activities: ReorderActivityInput[],
): Promise<Activity[]> {
  return ActivitySchema.array().parse(
    await request(`/api/trips/${tripId}/activities/reorder`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(ReorderActivitiesInputSchema.parse({ activities })),
    }),
  )
}

export async function reorderDayItems(
  accessToken: string,
  tripId: string,
  items: ReorderDayItemInput[],
) {
  return ReorderedDayItemsSchema.parse(
    await request(`/api/trips/${tripId}/day-items/reorder`, accessToken, {
      method: "PATCH",
      body: JSON.stringify(ReorderDayItemsInputSchema.parse({ items })),
    }),
  )
}

export async function deleteActivity(
  accessToken: string,
  tripId: string,
  activityId: string,
): Promise<void> {
  await request(`/api/trips/${tripId}/activities/${activityId}`, accessToken, {
    method: "DELETE",
  })
}
