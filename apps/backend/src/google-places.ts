import { z } from "zod"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import { PRODUCT_USER_AGENT } from "./brand.js"

const placeDetailsSchema = z.object({
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().min(1).nullable().optional(),
  location: z
    .object({
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
})

const placeSearchSchema = z.object({
  places: z.array(placeDetailsSchema),
})

export type ResolvedGooglePlace = {
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

export type GooglePlacesResolver = (googleMapsUrl: string) => Promise<ResolvedGooglePlace>

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
    name: query,
    address: query,
    latitude: locationBias.latitude,
    longitude: locationBias.longitude,
  }
}

async function requestGooglePlaces(
  apiKey: string,
  query: string,
  locationBias: PlaceSearchLocationBias | null,
): Promise<ResolvedGooglePlace> {
  let response: Response

  try {
    response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
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

  if (!response.ok) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link")
  }

  let responseBody: unknown

  try {
    responseBody = await response.json()
  } catch {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("Could not resolve Google Maps link", 503)
  }

  const result = placeSearchSchema.safeParse(responseBody)

  if (!result.success) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (fallback) {
      return fallback
    }

    throw new GooglePlacesError("No place found for Google Maps link")
  }

  if (result.data.places.length === 0) {
    const fallback = getPlaceUrlFallback(query, locationBias)

    if (!fallback) {
      throw new GooglePlacesError("No place found for Google Maps link")
    }

    return fallback
  }

  return {
    name: result.data.places[0].displayName.text,
    address: result.data.places[0].formattedAddress ?? query,
    latitude: result.data.places[0].location?.latitude ?? locationBias?.latitude ?? null,
    longitude: result.data.places[0].location?.longitude ?? locationBias?.longitude ?? null,
  }
}

export function createGooglePlacesResolver(
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
): GooglePlacesResolver {
  return async (googleMapsUrl) => {
    if (!apiKey) {
      throw new GooglePlacesError("Google Places is not configured", 503)
    }

    const inputUrl = parseAllowedGoogleUrl(googleMapsUrl)
    const resolvedUrl = getPlaceQuery(inputUrl) ? inputUrl : await resolveRedirectUrl(inputUrl)
    const placeQuery = getPlaceQuery(resolvedUrl)

    if (!placeQuery) {
      throw new GooglePlacesError("Could not resolve Google Maps link")
    }

    return requestGooglePlaces(apiKey, placeQuery, getPlaceSearchLocationBias(resolvedUrl))
  }
}
