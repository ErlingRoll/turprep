import { z } from "zod"
import { isAllowedGoogleMapsUrl } from "./google-maps.js"

export const GooglePlacePhotoSchema = z.object({
  name: z.string().min(1),
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
})

export const GooglePlaceOpeningHoursSchema = z.object({
  openNow: z.boolean().nullable(),
  weekdayDescriptions: z.string().array(),
})

export const GooglePlaceDetailsSchema = z.object({
  placeId: z.string().nullable().default(null),
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  category: z.string().nullable().default(null),
  businessStatus: z.string().nullable().default(null),
  priceLevel: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  phoneNumber: z.string().nullable().default(null),
  websiteUrl: z.string().url().nullable().default(null),
  rating: z.number().min(0).max(5).nullable().default(null),
  userRatingCount: z.number().int().nonnegative().nullable().default(null),
  openingHours: GooglePlaceOpeningHoursSchema.nullable().default(null),
  photos: GooglePlacePhotoSchema.array().max(10).default([]),
})

export const GooglePlaceDetailsInputSchema = z.object({
  googleMapsUrl: z.string().url().refine(isAllowedGoogleMapsUrl, "Google Maps link is invalid"),
})

export type GooglePlaceDetails = z.infer<typeof GooglePlaceDetailsSchema>
export type GooglePlacePhoto = z.infer<typeof GooglePlacePhotoSchema>
export type GooglePlaceOpeningHours = z.infer<typeof GooglePlaceOpeningHoursSchema>
export type GooglePlaceDetailsInput = z.infer<typeof GooglePlaceDetailsInputSchema>

/**
 * Free-text place lookup used by the map search box. The optional coordinates
 * bias the search towards the part of the world the user is currently looking
 * at, so a partial name like "central station" resolves near the trip.
 */
export const GooglePlaceSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
})

/** A search hit always has coordinates, because it has to be placed on the map. */
export const GooglePlaceSearchResultSchema = GooglePlaceDetailsSchema.extend({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  googleMapsUrl: z.string().url(),
})

export const GooglePlaceSearchResponseSchema = z.object({
  place: GooglePlaceSearchResultSchema.nullable(),
})

export type GooglePlaceSearchInput = z.infer<typeof GooglePlaceSearchInputSchema>
export type GooglePlaceSearchResult = z.infer<typeof GooglePlaceSearchResultSchema>
export type GooglePlaceSearchResponse = z.infer<typeof GooglePlaceSearchResponseSchema>
