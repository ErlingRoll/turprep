import { z } from "zod"
import {
  GooglePlaceDetailsSchema,
  GooglePlaceSuggestionsSchema,
  isAllowedGoogleMapsUrl,
  type GooglePlaceDetails,
  type GooglePlaceSuggestion,
  type GooglePlaceSuggestionsInput,
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
  const hasPlaceIdQuery = query.startsWith("place_id:")
  let placeId = hasPlaceIdQuery ? query.slice("place_id:".length).trim() : ""

  if (hasPlaceIdQuery && !/^[A-Za-z0-9_-]+$/.test(placeId)) {
    throw new GooglePlacesError("No place found for Google Maps link")
  }

  if (!hasPlaceIdQuery) {
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

    placeId = searchResult.data.places[0].id
  }

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

// ─── Suggestion helper ───────────────────────────────────────────────────────

const placeSuggestionResultSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().nullable().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .nullable()
    .optional(),
  primaryTypeDisplayName: z.object({ text: z.string().min(1) }).nullable().optional(),
  priceLevel: z.string().nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  userRatingCount: z.number().int().nonnegative().nullable().optional(),
  photos: z.object({ name: z.string().min(1) }).array().nullable().optional(),
})

const placeSuggestionSearchResponseSchema = z.object({
  places: placeSuggestionResultSchema.array().optional().default([]),
})

type SuggestionResult = z.infer<typeof placeSuggestionResultSchema>

const SUGGESTION_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
].join(",")

const SUGGESTION_MAX_RESULTS = 20
const SUGGESTION_RADIUS_METERS = 10_000
const SUGGESTION_MAX_RETURN = 10
const SUGGESTION_MAX_QUERY_ANSWERS = 4
const SUGGESTION_CACHE_TTL_MS = 2 * 60 * 1000

/**
 * Maps catalog optionIds to English search keywords appended to the base query.
 * "local" appears in both activity-mood and meal-style intentionally.
 */
const SUGGESTION_OPTION_KEYWORDS: Record<string, string> = {
  // activity-kind
  culture: "museum art gallery cultural",
  nature: "park nature trail",
  active: "sports activity outdoor",
  shopping: "shopping market boutique",
  family: "family attraction zoo",
  // activity-mood
  calm: "peaceful",
  social: "social",
  local: "local traditional",
  memorable: "landmark",
  "weather-proof": "indoor",
  "weather-indoor": "indoor",
  "weather-outdoor": "outdoor nature",
  "weather-any": "",
  // activity-effort
  short: "quick",
  easy: "easy",
  moderate: "",
  adventurous: "adventure",
  "effort-gentle": "easy",
  "effort-active": "active outdoor",
  "effort-challenging": "adventure hiking",
  // activity context
  "time-morning": "morning",
  "time-day": "daytime",
  "time-evening": "evening",
  "social-solo": "solo",
  "social-together": "couples",
  "social-group": "group",
  "scenery-water": "waterfront",
  "scenery-green": "park nature",
  "scenery-city": "city urban",
  "pace-quick": "quick",
  "pace-relaxed": "relaxed",
  "pace-full-day": "full day",
  "novelty-classic": "landmark popular",
  "novelty-hidden": "hidden gem local",
  "novelty-unusual": "unusual unique",
  "setting-inside": "indoor",
  "setting-outside": "outdoor",
  "setting-mixed": "indoor outdoor",
  "access-easy": "accessible",
  "access-transit": "public transport",
  "access-walk": "walking",
  // meal-occasion
  breakfast: "breakfast brunch",
  lunch: "lunch",
  dinner: "dinner",
  coffee: "cafe coffee",
  sweet: "bakery dessert",
  // meal-style
  international: "international",
  vegetarian: "vegetarian vegan",
  casual: "casual bistro",
  special: "fine dining gourmet",
  // meal-mood
  quiet: "quiet",
  lively: "lively",
  scenic: "scenic view",
  quick: "fast food",
  cozy: "cozy",
  "cuisine-local": "local Norwegian",
  "cuisine-asian": "Asian",
  "cuisine-european": "European",
  "cuisine-global": "international",
  "diet-any": "",
  "diet-vegetarian": "vegetarian",
  "diet-vegan": "vegan",
  "diet-gluten-free": "gluten free",
  "setting-casual": "casual bistro",
  "setting-special": "fine dining",
  "setting-cozy": "cozy",
  "setting-lively": "lively",
  "meal-pace-quick": "fast quick",
  "pace-unhurried": "slow relaxed",
  "pace-tasting": "tasting menu",
  "location-central": "city center",
  "location-scenic": "scenic view",
  "location-neighborhood": "neighborhood local",
  "company-solo": "solo",
  "company-two": "couples",
  "company-group": "group",
  "budget-value": "affordable",
  "budget-midrange": "mid-range",
  "budget-special": "expensive luxury",
  "experience-familiar": "classic",
  "experience-new": "new trendy",
  "experience-local": "local traditional",
  "atmosphere-quiet": "quiet",
  "atmosphere-social": "social lively",
  "atmosphere-romantic": "romantic",
}

const ITEM_TYPE_BASE_QUERY: Record<string, string> = {
  activity: "attraction sightseeing",
  meal: "restaurant food",
}

const SUGGESTION_SEASON_KEYWORDS: Record<string, string> = {
  spring: "spring",
  summer: "summer",
  autumn: "autumn fall",
  winter: "winter",
}

/** Builds a broad query plus recent answer queries, ordered by recency. */
export function buildSuggestionQueries(
  itemType: string,
  answers: { questionId: string; optionId: string }[],
  season = "any",
  searchMode = "refine",
  categoryHint?: string,
): string[] {
  const base = ITEM_TYPE_BASE_QUERY[itemType] ?? itemType
  const seasonKeyword = SUGGESTION_SEASON_KEYWORDS[season] ?? ""
  const modeKeyword =
    searchMode === "surprise" ? "unique local hidden gem" : searchMode === "similar" ? categoryHint ?? "" : ""
  const recentAnswers = answers.slice(-SUGGESTION_MAX_QUERY_ANSWERS)
  if (recentAnswers.length === 0) {
    return [[base, seasonKeyword, modeKeyword].filter(Boolean).join(" ")]
  }
  return [
    [base, seasonKeyword, modeKeyword].filter(Boolean).join(" "),
    ...recentAnswers.map((answer) => {
      const keyword = SUGGESTION_OPTION_KEYWORDS[answer.optionId] ?? ""
      return [base, seasonKeyword, modeKeyword, keyword].filter(Boolean).join(" ")
    }),
  ]
}

function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function fetchSuggestionResults(
  apiKey: string,
  textQuery: string,
  latitude: number,
  longitude: number,
  cache: Map<string, { expiresAt: number; result: Promise<SuggestionResult[]> }>,
): Promise<SuggestionResult[]> {
  const cacheKey = `${textQuery}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.result
  }

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }

  const result = fetchUncachedSuggestionResults(apiKey, textQuery, latitude, longitude)
  cache.set(cacheKey, {
    expiresAt: now + SUGGESTION_CACHE_TTL_MS,
    result,
  })
  return result
}

async function fetchUncachedSuggestionResults(
  apiKey: string,
  textQuery: string,
  latitude: number,
  longitude: number,
): Promise<SuggestionResult[]> {
  let response: Response
  try {
    response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SUGGESTION_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        languageCode: "nb",
        textQuery,
        maxResultCount: SUGGESTION_MAX_RESULTS,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: SUGGESTION_RADIUS_METERS,
          },
        },
      }),
    })
  } catch {
    return []
  }

  if (!response.ok) {
    return []
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return []
  }

  const parsed = placeSuggestionSearchResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.places : []
}

export type GooglePlacesSuggestionsResolver = (
  input: GooglePlaceSuggestionsInput,
) => Promise<GooglePlaceSuggestion[]>

export function createGooglePlacesSuggestionsResolver(
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
): GooglePlacesSuggestionsResolver {
  const suggestionCache = new Map<
    string,
    { expiresAt: number; result: Promise<SuggestionResult[]> }
  >()

  return async (input) => {
    if (!apiKey) {
      throw new GooglePlacesError("Google Places is not configured", 503)
    }

    const {
      latitude,
      longitude,
      itemType,
      season,
      searchMode,
      categoryHint,
      answers,
      excludedPlaceIds,
    } = input
    const excludedSet = new Set(excludedPlaceIds)

    // One query per answer. Index 0 = oldest answer (weight 1), last = most recent (highest weight).
    const queries = buildSuggestionQueries(itemType, answers, season, searchMode, categoryHint)

    const allResults = await Promise.all(
      queries.map((query) =>
        fetchSuggestionResults(apiKey, query, latitude, longitude, suggestionCache),
      ),
    )

    // Score and deduplicate across queries.
    // More-recent answers get higher weight; position in API response adds position score.
    const scored = new Map<string, { place: SuggestionResult; score: number }>()

    for (let qi = 0; qi < allResults.length; qi++) {
      const weight = qi + 1 // weight increases with answer recency
      const results = allResults[qi]

      for (let pos = 0; pos < results.length; pos++) {
        const place = results[pos]
        if (excludedSet.has(place.id)) continue

        const placeLat = place.location?.latitude
        const placeLon = place.location?.longitude
        if (placeLat === undefined || placeLon === undefined) {
          continue
        }

        const distanceMeters = haversineDistanceMeters(latitude, longitude, placeLat, placeLon)
        if (distanceMeters > SUGGESTION_RADIUS_METERS) {
          continue
        }

        const positionScore = (SUGGESTION_MAX_RESULTS - pos) / SUGGESTION_MAX_RESULTS
        const distanceScore = 0.25 * (1 - distanceMeters / SUGGESTION_RADIUS_METERS)
        const ratingScore =
          ((place.rating ?? 0) * Math.log10((place.userRatingCount ?? 0) + 10)) / 5

        const existing = scored.get(place.id)
        if (existing) {
          // Accumulate recency + position score; don't double-count rating
          existing.score += weight * positionScore
        } else {
          scored.set(place.id, {
            place,
            score: weight * positionScore + distanceScore + ratingScore,
          })
        }
      }
    }

    const sorted = Array.from(scored.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, SUGGESTION_MAX_RETURN)

    const suggestions: GooglePlaceSuggestion[] = sorted.map(({ place }) => {
      const placeLat = place.location?.latitude
      const placeLon = place.location?.longitude

      if (placeLat === undefined || placeLon === undefined) {
        throw new GooglePlacesError("Google place location is invalid")
      }

      return {
        placeId: place.id,
        name: place.displayName.text,
        address: place.formattedAddress ?? place.displayName.text,
        latitude: placeLat,
        longitude: placeLon,
        category: place.primaryTypeDisplayName?.text ?? null,
        priceLevel: place.priceLevel ?? null,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`,
        photoNames: place.photos?.map((photo) => photo.name).slice(0, 4) ?? [],
        matchOptionIds: answers.slice(-3).map((answer) => answer.optionId),
        distanceMeters: Math.round(haversineDistanceMeters(latitude, longitude, placeLat, placeLon)),
      }
    })

    return GooglePlaceSuggestionsSchema.parse(suggestions)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
