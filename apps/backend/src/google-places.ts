import { z } from "zod"
import {
  GooglePlaceDetailsSchema,
  isAllowedGoogleMapsUrl,
  type GooglePlaceDetails,
} from "@turprep/models"
import { PRODUCT_USER_AGENT } from "./brand.js"

const placeDetailsSchema = z.object({
  id: z.string().nullable().optional(),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().min(1).nullable().optional(),
  primaryTypeDisplayName: z.object({ text: z.string().min(1) }).nullable().optional(),
  businessStatus: z.string().nullable().optional(),
  priceLevel: z.string().nullable().optional(),
  editorialSummary: z.object({ text: z.string().min(1) }).nullable().optional(),
  nationalPhoneNumber: z.string().nullable().optional(),
  websiteUri: z.string().url().nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  userRatingCount: z.number().int().nonnegative().nullable().optional(),
  regularOpeningHours: z
    .object({
      openNow: z.boolean().nullable().optional(),
      weekdayDescriptions: z.string().array(),
    })
    .nullable()
    .optional(),
  currentOpeningHours: z
    .object({
      openNow: z.boolean().nullable().optional(),
      weekdayDescriptions: z.string().array(),
    })
    .nullable()
    .optional(),
  location: z
    .object({
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  photos: z
    .object({
      name: z.string().min(1),
      widthPx: z.number().int().positive().nullable().optional(),
      heightPx: z.number().int().positive().nullable().optional(),
    })
    .array()
    .nullable()
    .optional(),
})

const placeSearchSchema = z.object({
  places: z.array(placeDetailsSchema),
})

const placeSearchIdSchema = z.object({
  places: z
    .object({
      id: z.string().min(1),
    })
    .array(),
})

const placeDetailsFieldMask = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryTypeDisplayName",
  "businessStatus",
  "priceLevel",
  "editorialSummary",
  "nationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "currentOpeningHours",
  "photos",
].join(",")

export type ResolvedGooglePlace = Pick<
  GooglePlaceDetails,
  "name" | "address" | "latitude" | "longitude"
> &
  Partial<Omit<GooglePlaceDetails, "name" | "address" | "latitude" | "longitude">>

export type GooglePlacesResolver = (googleMapsUrl: string) => Promise<ResolvedGooglePlace>

export type GooglePlacesPhotoResolver = (
  photoName: string,
) => Promise<{ body: Buffer; contentType: string }>

type PlaceSearchLocationBias = {
  latitude: number
  longitude: number
  radius: number
}

export class GooglePlacesError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 503 = 400,
  ) {
    super(message)
    this.name = "GooglePlacesError"
  }
}

function parseAllowedGoogleUrl(value: string) {
  let url: URL

  if (!isAllowedGoogleMapsUrl(value)) {
    throw new GooglePlacesError("Google Maps link is invalid")
  }

  url = new URL(value)

  return url
}

async function resolveRedirectUrl(inputUrl: URL): Promise<URL> {
  let currentUrl = inputUrl

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      headers: { "User-Agent": PRODUCT_USER_AGENT },
      redirect: "manual",
    })

    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) {
        throw new GooglePlacesError("Could not resolve Google Maps link")
      }
      return currentUrl
    }

    const location = response.headers.get("location")

    if (!location) {
      throw new GooglePlacesError("Could not resolve Google Maps link")
    }

    currentUrl = parseAllowedGoogleUrl(new URL(location, currentUrl).toString())
  }

  throw new GooglePlacesError("Could not resolve Google Maps link")
}

function getPlaceQuery(url: URL): string | null {
  const queryParameter = url.searchParams.get("query") ?? url.searchParams.get("q")

  if (queryParameter) {
    return queryParameter
  }

  const pathParts = url.pathname.split("/").filter(Boolean)
  const placeIndex = pathParts.findIndex((part) => part === "place" || part === "search")
  const placePart = placeIndex >= 0 ? pathParts[placeIndex + 1] : null

  if (!placePart || placePart.startsWith("@")) {
    return null
  }

  return decodeURIComponent(placePart.replace(/\+/g, " "))
}

function getPlaceSearchLocationBias(url: URL): PlaceSearchLocationBias | null {
  const placeCoordinates = url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)

  if (placeCoordinates) {
    return {
      latitude: Number(placeCoordinates[1]),
      longitude: Number(placeCoordinates[2]),
      radius: 1000,
    }
  }

  const mapCenter = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)

  if (!mapCenter) {
    return null
  }

  return {
    latitude: Number(mapCenter[1]),
    longitude: Number(mapCenter[2]),
    radius: 5000,
  }
}

function getPlaceUrlFallback(
  query: string,
  locationBias: PlaceSearchLocationBias | null,
): ResolvedGooglePlace | null {
  if (!locationBias) {
    return null
  }

  return {
    placeId: null,
    name: query,
    address: query,
    latitude: locationBias.latitude,
    longitude: locationBias.longitude,
    category: null,
    businessStatus: null,
    priceLevel: null,
    summary: null,
    phoneNumber: null,
    websiteUrl: null,
    rating: null,
    userRatingCount: null,
    openingHours: null,
    photos: [],
  }
}

async function requestGooglePlaces(
  apiKey: string,
  query: string,
  locationBias: PlaceSearchLocationBias | null,
): Promise<ResolvedGooglePlace> {
  let searchResponse: Response

  try {
    searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        languageCode: "nb",
        textQuery: query,
        ...(locationBias
          ? {
              locationBias: {
                circle: {
                  center: {
                    latitude: locationBias.latitude,
                    longitude: locationBias.longitude,
                  },
                  radius: locationBias.radius,
                },
              },
            }
          : {}),
      }),
    })
  } catch {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link", 503)
  }

  if (!searchResponse.ok) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link")
  }

  let searchResponseBody: unknown

  try {
    searchResponseBody = await searchResponse.json()
  } catch {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link", 503)
  }

  const searchResult = placeSearchIdSchema.safeParse(searchResponseBody)
  if (!searchResult.success || searchResult.data.places.length === 0) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("No place found for Google Maps link")
  }

  const placeId = searchResult.data.places[0].id
  const placeResourceName = placeId.startsWith("places/") ? placeId : `places/${placeId}`
  let detailsResponse: Response

  try {
    detailsResponse = await fetch(
      `https://places.googleapis.com/v1/${placeResourceName
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": placeDetailsFieldMask,
        },
      },
    )
  } catch {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link", 503)
  }

  if (!detailsResponse.ok) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link")
  }

  let detailsResponseBody: unknown

  try {
    detailsResponseBody = await detailsResponse.json()
  } catch {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link", 503)
  }

  const result = placeSearchSchema.safeParse({ places: [detailsResponseBody] })
  if (!result.success) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("No place found for Google Maps link")
  }

  return {
    placeId: result.data.places[0].id ?? null,
    name: result.data.places[0].displayName.text,
    address: result.data.places[0].formattedAddress ?? query,
    latitude: result.data.places[0].location?.latitude ?? locationBias?.latitude ?? null,
    longitude: result.data.places[0].location?.longitude ?? locationBias?.longitude ?? null,
    category: result.data.places[0].primaryTypeDisplayName?.text ?? null,
    businessStatus: result.data.places[0].businessStatus ?? null,
    priceLevel: result.data.places[0].priceLevel ?? null,
    summary: result.data.places[0].editorialSummary?.text ?? null,
    phoneNumber: result.data.places[0].nationalPhoneNumber ?? null,
    websiteUrl: result.data.places[0].websiteUri ?? null,
    rating: result.data.places[0].rating ?? null,
    userRatingCount: result.data.places[0].userRatingCount ?? null,
    openingHours: (
      result.data.places[0].currentOpeningHours ?? result.data.places[0].regularOpeningHours
    )
      ? {
          openNow:
            (
              result.data.places[0].currentOpeningHours ??
              result.data.places[0].regularOpeningHours
            )?.openNow ?? null,
          weekdayDescriptions: (
            result.data.places[0].currentOpeningHours ??
            result.data.places[0].regularOpeningHours
          )?.weekdayDescriptions ?? [],
        }
      : null,
    photos:
      result.data.places[0].photos?.map((photo) => ({
        name: photo.name,
        widthPx: photo.widthPx ?? null,
        heightPx: photo.heightPx ?? null,
      })) ?? [],
  }
}

export function createGooglePlacesResolver(
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
): GooglePlacesResolver {
  const cache = new Map<string, { expiresAt: number; place: ResolvedGooglePlace }>()
  const cacheDurationMs = 15 * 60 * 1000

  return async (googleMapsUrl) => {
    if (!apiKey) {
      throw new GooglePlacesError("Google Places is not configured", 503)
    }

    const cacheKey = googleMapsUrl.trim()
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.place
    }

    const inputUrl = parseAllowedGoogleUrl(googleMapsUrl)
    const resolvedUrl = getPlaceQuery(inputUrl) ? inputUrl : await resolveRedirectUrl(inputUrl)
    const placeQuery = getPlaceQuery(resolvedUrl)

    if (!placeQuery) {
      throw new GooglePlacesError("Could not resolve Google Maps link")
    }

    const place = GooglePlaceDetailsSchema.parse(
      await requestGooglePlaces(apiKey, placeQuery, getPlaceSearchLocationBias(resolvedUrl)),
    )
    cache.set(cacheKey, { expiresAt: Date.now() + cacheDurationMs, place })
    return place
  }
}

const googlePlacePhotoNamePattern = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/

export function createGooglePlacesPhotoResolver(
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
): GooglePlacesPhotoResolver {
  return async (photoName) => {
    if (!googlePlacePhotoNamePattern.test(photoName)) {
      throw new GooglePlacesError("Google place photo is invalid")
    }

    if (!apiKey) {
      throw new GooglePlacesError("Google Places is not configured", 503)
    }

    let response: Response
    try {
      response = await fetch(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${encodeURIComponent(apiKey)}`,
      )
    } catch {
      throw new GooglePlacesError("Could not load Google place photo", 503)
    }

    if (!response.ok) {
      throw new GooglePlacesError("Could not load Google place photo", 503)
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "image/jpeg",
    }
  }
}
