import {
  GooglePlaceSuggestionSchema,
  SuggestionAnswerSchema,
  SuggestionDestinationSchema,
  SuggestionItemTypeSchema,
  SuggestionRegionSchema,
  SuggestionSearchModeSchema,
  SuggestionSeasonSchema,
  type GooglePlaceSuggestion,
  type SuggestionAnswer,
  type SuggestionDestination,
  type SuggestionItemType,
  type SuggestionRegion,
  type SuggestionSearchMode,
  type SuggestionSeason,
} from "@turprep/models"
import { z } from "zod"

const suggestionSessionVersion = 1

const suggestionPinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

const suggestionSessionStateSchema = z.object({
  version: z.literal(suggestionSessionVersion),
  isSuggestionOpen: z.boolean(),
  isDroppingSuggestionPin: z.boolean(),
  pin: suggestionPinSchema.nullable(),
  suggestions: GooglePlaceSuggestionSchema.array().max(10),
  selectedSuggestionPlaceId: z.string().nullable(),
  itemType: SuggestionItemTypeSchema.nullable(),
  season: SuggestionSeasonSchema,
  region: SuggestionRegionSchema,
  searchMode: SuggestionSearchModeSchema,
  categoryHint: z.string().nullable(),
  answers: SuggestionAnswerSchema.array().max(100),
  askedQuestionCount: z.number().int().nonnegative(),
  recentQuestionIds: z.string().array().max(100),
  currentQuestionId: z.string().nullable(),
  addedPlaceIds: z.string().array(),
  pendingSuggestion: GooglePlaceSuggestionSchema.nullable(),
  pendingDestination: SuggestionDestinationSchema.nullable(),
  pendingDate: z.string(),
})

export type SuggestionSessionState = {
  version: typeof suggestionSessionVersion
  isSuggestionOpen: boolean
  isDroppingSuggestionPin: boolean
  pin: { latitude: number; longitude: number } | null
  suggestions: GooglePlaceSuggestion[]
  selectedSuggestionPlaceId: string | null
  itemType: SuggestionItemType | null
  season: SuggestionSeason
  region: SuggestionRegion
  searchMode: SuggestionSearchMode
  categoryHint: string | null
  answers: SuggestionAnswer[]
  askedQuestionCount: number
  recentQuestionIds: string[]
  currentQuestionId: string | null
  addedPlaceIds: string[]
  pendingSuggestion: GooglePlaceSuggestion | null
  pendingDestination: SuggestionDestination | null
  pendingDate: string
}

const storageKeyPrefix = "turprep.suggestion-helper"

function getStorageKey(tripId: string) {
  return `${storageKeyPrefix}.${tripId}`
}

export function getDefaultSuggestionSessionState(): SuggestionSessionState {
  return {
    version: suggestionSessionVersion,
    isSuggestionOpen: false,
    isDroppingSuggestionPin: false,
    pin: null,
    suggestions: [],
    selectedSuggestionPlaceId: null,
    itemType: null,
    season: "any",
    region: "global",
    searchMode: "refine",
    categoryHint: null,
    answers: [],
    askedQuestionCount: 0,
    recentQuestionIds: [],
    currentQuestionId: null,
    addedPlaceIds: [],
    pendingSuggestion: null,
    pendingDestination: null,
    pendingDate: "",
  }
}

export function getSuggestionSessionState(tripId: string): SuggestionSessionState | null {
  if (typeof window === "undefined") {
    return null
  }

  const storedValue = window.sessionStorage.getItem(getStorageKey(tripId))
  if (!storedValue) {
    return null
  }

  try {
    const parsedValue = suggestionSessionStateSchema.safeParse(JSON.parse(storedValue))
    return parsedValue.success ? parsedValue.data : null
  } catch {
    return null
  }
}

export function updateSuggestionSessionState(
  tripId: string,
  update: Partial<SuggestionSessionState>,
) {
  if (typeof window === "undefined") {
    return
  }

  const currentState = getSuggestionSessionState(tripId) ?? getDefaultSuggestionSessionState()
  window.sessionStorage.setItem(
    getStorageKey(tripId),
    JSON.stringify({ ...currentState, ...update, version: suggestionSessionVersion }),
  )
}

export function clearSuggestionSessionState(tripId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem(getStorageKey(tripId))
}
