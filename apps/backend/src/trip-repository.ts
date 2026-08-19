import { randomUUID } from "node:crypto"
import {
  ActivitySchema,
  CreateActivityInputSchema,
  CreateHousingStayInputSchema,
  CreateMealInputSchema,
  CreateTripInputSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  HousingStaySchema,
  MealSchema,
  TripDetailSchema,
  TripSchema,
  ReorderActivitiesInputSchema,
  ReorderDayItemsInputSchema,
  InviteTripMemberInputSchema,
  RequestTripAccessInputSchema,
  SetTripItemPreferenceInputSchema,
  TripAccessLinkSchema,
  TripAccessRequestSchema,
  TripAccessStatusSchema,
  TripInvitationSchema,
  TripMemberSchema,
  TripSharingSchema,
  TripItemPreferenceSchema,
  TripCurrencySettingsSchema,
  TripItemDetailVisibilitySchema,
  UpdateTripCurrencySettingsInputSchema,
  UpdateTripItemDetailVisibilityInputSchema,
  UpdateHousingStayInputSchema,
  UpdateMealInputSchema,
  UpdateTripDayInputSchema,
  UpdateTripInputSchema,
  UpdateActivityInputSchema,
  type Activity,
  type CreateActivityInput,
  type CreateHousingStayInput,
  type CreateMealInput,
  type CreateTripInput,
  type HousingStay,
  type Meal,
  type Trip,
  type TripDay,
  type TripDetail,
  type UpdateHousingStayInput,
  type UpdateMealInput,
  type UpdateTripDayInput,
  type UpdateTripInput,
  type UpdateActivityInput,
  type ReorderActivitiesInput,
  type ReorderDayItemsInput,
  type TripAccessLink,
  type TripAccessRequest,
  type TripAccessStatus,
  type TripInvitation,
  type TripMember,
  type TripSharing,
  type InviteTripMemberInput,
  type RequestTripAccessInput,
  type SetTripItemPreferenceInput,
  type TripItemPreference,
  type TripCurrencySettings,
  type UpdateTripCurrencySettingsInput,
  type TripItemDetailVisibility,
  type UpdateTripItemDetailVisibilityInput,
} from "@turprep/models"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createUserSupabaseClient } from "./supabase.js"

const tripRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_date: DateOnlySchema,
  end_date: DateOnlySchema,
  notes: z.string().nullable(),
  accepted_currencies: z.array(CurrencyCodeSchema).default([]),
})

const tripDayRowSchema = z.object({
  trip_id: z.string(),
  trip_date: DateOnlySchema,
  title: z.string().nullable(),
  notes: z.string().nullable(),
})

const activityRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  trip_date: DateOnlySchema.nullable(),
  is_backup: z.boolean(),
  title: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  all_day: z.boolean(),
  notes: z.string().nullable(),
  google_maps_url: z.string().nullable(),
  place_name: z.string().nullable(),
  place_address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  price_amount: z.number().nullable(),
  price_currency: z.string().nullable(),
  website: z.string().nullable(),
  sort_order: z.number().int(),
})

const housingStayRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  name: z.string(),
  check_in: DateOnlySchema.nullable(),
  check_out: DateOnlySchema.nullable(),
  is_backup: z.boolean(),
  notes: z.string().nullable(),
  google_maps_url: z.string().nullable(),
  place_name: z.string().nullable(),
  place_address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  price_amount: z.number().nullable(),
  price_currency: z.string().nullable(),
  website: z.string().nullable(),
})

const mealRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  trip_date: DateOnlySchema.nullable(),
  is_backup: z.boolean(),
  title: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  all_day: z.boolean(),
  notes: z.string().nullable(),
  google_maps_url: z.string().nullable(),
  place_name: z.string().nullable(),
  place_address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  price_amount: z.number().nullable(),
  price_currency: z.string().nullable(),
  sort_order: z.number().int(),
  website: z.string().nullable(),
})

const tripOwnerRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
})

const databaseDateTimeSchema = z.coerce.date().transform((value) => value.toISOString())

const tripMemberRowSchema = z.object({
  trip_id: z.string(),
  user_id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: databaseDateTimeSchema,
})

const tripInvitationRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  email: z.string(),
  status: z.enum(["pending", "accepted", "declined", "revoked"]),
  created_at: databaseDateTimeSchema,
})

const tripAccessLinkRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  token: z.string(),
  revoked_at: databaseDateTimeSchema.nullable(),
  created_at: databaseDateTimeSchema,
})

const tripAccessRequestRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  requester_id: z.string(),
  requester_name: z.string().nullable(),
  email: z.string(),
  source: z.enum(["email", "link"]),
  status: z.enum(["pending", "approved", "denied"]),
  created_at: databaseDateTimeSchema,
})

const tripItemPreferenceRowSchema = z.object({
  id: z.string(),
  trip_id: z.string(),
  user_id: z.string(),
  activity_id: z.string().nullable(),
  meal_id: z.string().nullable(),
  housing_stay_id: z.string().nullable(),
  value: z.enum(["green", "yellow", "red"]),
  updated_at: databaseDateTimeSchema,
})

const tripItemDetailVisibilityRowSchema = z.object({
  show_price: z.boolean(),
  show_website: z.boolean(),
})

const tripColumns = "id, name, start_date, end_date, notes, accepted_currencies"
const activityColumns =
  "id, trip_id, trip_date, is_backup, title, start_time, end_time, all_day, notes, google_maps_url, place_name, place_address, latitude, longitude, price_amount, price_currency, website, sort_order"
const housingStayColumns =
  "id, trip_id, name, check_in, check_out, is_backup, notes, google_maps_url, place_name, place_address, latitude, longitude, price_amount, price_currency, website"
const mealColumns =
  "id, trip_id, trip_date, is_backup, title, start_time, end_time, all_day, notes, google_maps_url, place_name, place_address, latitude, longitude, price_amount, price_currency, website, sort_order"

async function getHighestDayItemSortOrder(
  client: SupabaseClient,
  tripId: string,
  tripDate: string,
) {
  const [{ data: activities, error: activitiesError }, { data: meals, error: mealsError }] =
    await Promise.all([
      client
        .from("activities")
        .select("sort_order")
        .eq("trip_id", tripId)
        .eq("is_backup", false)
        .eq("trip_date", tripDate)
        .order("sort_order", { ascending: false })
        .limit(1),
      client
        .from("meals")
        .select("sort_order")
        .eq("trip_id", tripId)
        .eq("is_backup", false)
        .eq("trip_date", tripDate)
        .order("sort_order", { ascending: false })
        .limit(1),
    ])

  if (activitiesError) {
    throw activitiesError
  }
  if (mealsError) {
    throw mealsError
  }
  const highestSortOrders = z
    .array(z.object({ sort_order: z.number().int() }))
    .parse([...(activities ?? []), ...(meals ?? [])])

  return Math.max(-1, ...highestSortOrders.map((item) => item.sort_order))
}

export interface TripRepository {
  listTrips(userId: string, accessToken: string): Promise<Trip[]>
  getTrip(userId: string, accessToken: string, tripId: string): Promise<TripDetail | null>
  createTrip(
    userId: string,
    accessToken: string,
    input: CreateTripInput,
    userEmail?: string | null,
    userName?: string | null,
  ): Promise<Trip>
  updateTrip(
    userId: string,
    accessToken: string,
    tripId: string,
    input: UpdateTripInput,
  ): Promise<TripDetail | null>
  setTripItemPreference(
    userId: string,
    accessToken: string,
    tripId: string,
    input: SetTripItemPreferenceInput,
  ): Promise<TripItemPreference | null>
  getTripCurrencies(
    userId: string,
    accessToken: string,
    tripId: string,
  ): Promise<TripCurrencySettings | null>
  updateTripCurrencies(
    userId: string,
    accessToken: string,
    tripId: string,
    input: UpdateTripCurrencySettingsInput,
  ): Promise<TripCurrencySettings | null>
  getTripItemDetailVisibility(
    userId: string,
    accessToken: string,
    tripId: string,
  ): Promise<TripItemDetailVisibility | null>
  updateTripItemDetailVisibility(
    userId: string,
    accessToken: string,
    tripId: string,
    input: UpdateTripItemDetailVisibilityInput,
  ): Promise<TripItemDetailVisibility | null>
  deleteTrip(userId: string, accessToken: string, tripId: string): Promise<boolean>
  updateDay(
    userId: string,
    accessToken: string,
    tripId: string,
    tripDate: string,
    input: UpdateTripDayInput,
  ): Promise<TripDay | null>
  getHousingStay(
    userId: string,
    accessToken: string,
    tripId: string,
    housingStayId: string,
  ): Promise<HousingStay | null>
  createHousingStay(
    userId: string,
    accessToken: string,
    tripId: string,
    input: CreateHousingStayInput,
  ): Promise<HousingStay | null>
  updateHousingStay(
    userId: string,
    accessToken: string,
    tripId: string,
    housingStayId: string,
    input: UpdateHousingStayInput,
  ): Promise<HousingStay | null>
  deleteHousingStay(
    userId: string,
    accessToken: string,
    tripId: string,
    housingStayId: string,
  ): Promise<boolean>
  getMeal(userId: string, accessToken: string, tripId: string, mealId: string): Promise<Meal | null>
  createMeal(
    userId: string,
    accessToken: string,
    tripId: string,
    input: CreateMealInput,
  ): Promise<Meal | null>
  updateMeal(
    userId: string,
    accessToken: string,
    tripId: string,
    mealId: string,
    input: UpdateMealInput,
  ): Promise<Meal | null>
  deleteMeal(userId: string, accessToken: string, tripId: string, mealId: string): Promise<boolean>
  getActivity(
    userId: string,
    accessToken: string,
    tripId: string,
    activityId: string,
  ): Promise<Activity | null>
  createActivity(
    userId: string,
    accessToken: string,
    tripId: string,
    input: CreateActivityInput,
  ): Promise<Activity | null>
  updateActivity(
    userId: string,
    accessToken: string,
    tripId: string,
    activityId: string,
    input: UpdateActivityInput,
  ): Promise<Activity | null>
  reorderActivities(
    userId: string,
    accessToken: string,
    tripId: string,
    input: ReorderActivitiesInput,
  ): Promise<Activity[] | null>
  reorderDayItems(
    userId: string,
    accessToken: string,
    tripId: string,
    input: ReorderDayItemsInput,
  ): Promise<{ activities: Activity[]; meals: Meal[] } | null>
  getTripSharing(userId: string, accessToken: string, tripId: string): Promise<TripSharing | null>
  getTripOwnerEmail(userId: string, accessToken: string, tripId: string): Promise<string | null>
  getTripAccessStatus(
    userId: string,
    accessToken: string,
    tripId: string,
  ): Promise<TripAccessStatus>
  createTripInvitation(
    userId: string,
    accessToken: string,
    tripId: string,
    input: InviteTripMemberInput,
  ): Promise<TripInvitation | null>
  createTripAccessLink(
    userId: string,
    accessToken: string,
    tripId: string,
  ): Promise<TripAccessLink | null>
  requestTripAccess(
    userId: string,
    accessToken: string,
    tripId: string,
    email: string,
    requesterName: string | null,
    input: RequestTripAccessInput,
  ): Promise<TripAccessStatus | null>
  approveTripAccessRequest(
    userId: string,
    accessToken: string,
    tripId: string,
    requestId: string,
  ): Promise<TripMember | null>
  denyTripAccessRequest(
    userId: string,
    accessToken: string,
    tripId: string,
    requestId: string,
  ): Promise<TripAccessRequest | null>
  revokeTripInvitation(
    userId: string,
    accessToken: string,
    tripId: string,
    invitationId: string,
  ): Promise<TripInvitation | null>
  revokeTripAccessLink(
    userId: string,
    accessToken: string,
    tripId: string,
    linkId: string,
  ): Promise<TripAccessLink | null>
  removeTripMember(
    userId: string,
    accessToken: string,
    tripId: string,
    memberId: string,
  ): Promise<{ email: string | null } | null>
  deleteActivity(
    userId: string,
    accessToken: string,
    tripId: string,
    activityId: string,
  ): Promise<boolean>
}

export class CurrencyRemovalError extends Error {
  readonly currencies: string[]

  constructor(currencies: string[]) {
    super(
      `Cannot remove currencies currently used by trip items: ${currencies.join(", ")}. ` +
        "Update the item prices before removing these currencies.",
    )
    this.name = "CurrencyRemovalError"
    this.currencies = currencies
  }
}

async function ensureCurrenciesAreNotUsedByTripItems(
  client: SupabaseClient,
  tripId: string,
  acceptedCurrencies: string[],
) {
  const results = await Promise.all([
    client
      .from("activities")
      .select("price_currency")
      .eq("trip_id", tripId)
      .not("price_currency", "is", null),
    client
      .from("meals")
      .select("price_currency")
      .eq("trip_id", tripId)
      .not("price_currency", "is", null),
    client
      .from("housing_stays")
      .select("price_currency")
      .eq("trip_id", tripId)
      .not("price_currency", "is", null),
  ])

  const usedCurrencies = new Set<string>()
  for (const result of results) {
    if (result.error) {
      throw result.error
    }

    for (const row of z
      .array(z.object({ price_currency: z.string().nullable() }))
      .parse(result.data ?? [])) {
      if (row.price_currency) {
        usedCurrencies.add(CurrencyCodeSchema.parse(row.price_currency))
      }
    }
  }

  const removedCurrencies = [...usedCurrencies]
    .filter((currency) => !acceptedCurrencies.includes(currency))
    .sort()

  if (removedCurrencies.length > 0) {
    throw new CurrencyRemovalError(removedCurrencies)
  }
}

function dateToUtcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day))

  if (utcDate.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}`)
  }

  return utcDate
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  try {
    return dateToUtcDate(startDate) <= dateToUtcDate(endDate)
  } catch {
    return false
  }
}

export function isDateWithinTrip(trip: Trip, date: string): boolean {
  return isValidDateRange(date, date) && date >= trip.startDate && date <= trip.endDate
}

export function buildTripDays(trip: Trip): TripDetail["days"] {
  const currentDate = dateToUtcDate(trip.startDate)
  const endDate = dateToUtcDate(trip.endDate)
  const days: TripDetail["days"] = []
  let dayNumber = 1

  while (currentDate <= endDate) {
    days.push({
      date: currentDate.toISOString().slice(0, 10),
      dayNumber,
      title: null,
      notes: null,
      activities: [],
    })
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    dayNumber += 1
  }

  return days
}

function mapTripRow(row: unknown): Trip {
  const parsedRow = tripRowSchema.parse(row)

  return TripSchema.parse({
    id: parsedRow.id,
    name: parsedRow.name,
    startDate: parsedRow.start_date,
    endDate: parsedRow.end_date,
    notes: parsedRow.notes,
    acceptedCurrencies: parsedRow.accepted_currencies,
  })
}

function mapTripDayRow(row: unknown): Pick<TripDay, "date" | "title" | "notes"> {
  const parsedRow = tripDayRowSchema.parse(row)

  return {
    date: parsedRow.trip_date,
    title: parsedRow.title,
    notes: parsedRow.notes,
  }
}

function mapActivityRow(row: unknown): Activity {
  const parsedRow = activityRowSchema.parse(row)

  return ActivitySchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    tripDate: parsedRow.trip_date,
    isBackup: parsedRow.is_backup,
    title: parsedRow.title,
    startTime: parsedRow.start_time?.slice(0, 5) ?? null,
    endTime: parsedRow.end_time?.slice(0, 5) ?? null,
    allDay: parsedRow.all_day,
    notes: parsedRow.notes,
    googleMapsUrl: parsedRow.google_maps_url,
    placeName: parsedRow.place_name,
    placeAddress: parsedRow.place_address,
    latitude: parsedRow.latitude,
    longitude: parsedRow.longitude,
    priceAmount: parsedRow.price_amount,
    priceCurrency: parsedRow.price_currency,
    website: parsedRow.website,
    sortOrder: parsedRow.sort_order,
  })
}

function mapHousingStayRow(row: unknown): HousingStay {
  const parsedRow = housingStayRowSchema.parse(row)

  return HousingStaySchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    name: parsedRow.name,
    checkIn: parsedRow.check_in,
    checkOut: parsedRow.check_out,
    isBackup: parsedRow.is_backup,
    notes: parsedRow.notes,
    googleMapsUrl: parsedRow.google_maps_url,
    placeName: parsedRow.place_name,
    placeAddress: parsedRow.place_address,
    latitude: parsedRow.latitude,
    longitude: parsedRow.longitude,
    priceAmount: parsedRow.price_amount,
    priceCurrency: parsedRow.price_currency,
    website: parsedRow.website,
  })
}

function mapMealRow(row: unknown): Meal {
  const parsedRow = mealRowSchema.parse(row)

  return MealSchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    tripDate: parsedRow.trip_date,
    isBackup: parsedRow.is_backup,
    title: parsedRow.title,
    startTime: parsedRow.start_time?.slice(0, 5) ?? null,
    endTime: parsedRow.end_time?.slice(0, 5) ?? null,
    allDay: parsedRow.all_day,
    notes: parsedRow.notes,
    googleMapsUrl: parsedRow.google_maps_url,
    placeName: parsedRow.place_name,
    placeAddress: parsedRow.place_address,
    latitude: parsedRow.latitude,
    longitude: parsedRow.longitude,
    priceAmount: parsedRow.price_amount,
    priceCurrency: parsedRow.price_currency,
    sortOrder: parsedRow.sort_order,
    website: parsedRow.website,
  })
}

function mapTripMemberRow(row: unknown, ownerId: string): TripMember {
  const parsedRow = tripMemberRowSchema.parse(row)

  return TripMemberSchema.parse({
    userId: parsedRow.user_id,
    name: parsedRow.name,
    email: parsedRow.email,
    role: parsedRow.user_id === ownerId ? "owner" : "member",
    joinedAt: parsedRow.created_at,
  })
}

function mapTripInvitationRow(row: unknown): TripInvitation {
  const parsedRow = tripInvitationRowSchema.parse(row)

  return TripInvitationSchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    email: parsedRow.email,
    status: parsedRow.status,
    createdAt: parsedRow.created_at,
  })
}

function mapTripAccessLinkRow(row: unknown): TripAccessLink {
  const parsedRow = tripAccessLinkRowSchema.parse(row)

  return TripAccessLinkSchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    token: parsedRow.token,
    revokedAt: parsedRow.revoked_at,
    createdAt: parsedRow.created_at,
  })
}

function mapTripAccessRequestRow(row: unknown): TripAccessRequest {
  const parsedRow = tripAccessRequestRowSchema.parse(row)

  return TripAccessRequestSchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    email: parsedRow.email,
    source: parsedRow.source,
    status: parsedRow.status,
    createdAt: parsedRow.created_at,
  })
}

function mapTripAccessStatus(status: TripAccessStatus["status"], isNew = false): TripAccessStatus {
  return TripAccessStatusSchema.parse({ status, isNew })
}

function mapTripItemPreferenceRow(row: unknown): TripItemPreference {
  const parsedRow = tripItemPreferenceRowSchema.parse(row)
  const itemTypeAndId =
    parsedRow.activity_id !== null
      ? { itemType: "activity" as const, itemId: parsedRow.activity_id }
      : parsedRow.meal_id !== null
        ? { itemType: "meal" as const, itemId: parsedRow.meal_id }
        : parsedRow.housing_stay_id !== null
          ? { itemType: "housing" as const, itemId: parsedRow.housing_stay_id }
          : null

  if (!itemTypeAndId) {
    throw new Error("Trip item preference has no associated item")
  }

  return TripItemPreferenceSchema.parse({
    id: parsedRow.id,
    tripId: parsedRow.trip_id,
    userId: parsedRow.user_id,
    ...itemTypeAndId,
    value: parsedRow.value,
    updatedAt: parsedRow.updated_at,
  })
}

function getPreferenceItemColumn(itemType: SetTripItemPreferenceInput["itemType"]) {
  return itemType === "activity"
    ? "activity_id"
    : itemType === "meal"
      ? "meal_id"
      : "housing_stay_id"
}

async function getLatestTripAccessRequest(client: SupabaseClient, userId: string, tripId: string) {
  const { data, error } = await client
    .from("trip_access_requests")
    .select("id, trip_id, requester_id, requester_name, email, source, status, created_at")
    .eq("trip_id", tripId)
    .eq("requester_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  const rows = z.array(tripAccessRequestRowSchema).parse(data)
  return rows[0] ?? null
}

async function getTripOwnerId(client: SupabaseClient, tripId: string): Promise<string | null> {
  const { data, error } = await client
    .from("trips")
    .select("id, owner_id")
    .eq("id", tripId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? tripOwnerRowSchema.parse(data).owner_id : null
}

async function selectActivity(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
  activityId: string,
): Promise<Activity | null> {
  const { data, error } = await client
    .from("activities")
    .select(activityColumns)
    .eq("trip_id", tripId)
    .eq("id", activityId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapActivityRow(data) : null
}

async function listActivities(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
): Promise<Activity[]> {
  const { data, error } = await client
    .from("activities")
    .select(activityColumns)
    .eq("trip_id", tripId)
    .order("trip_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })

  if (error) {
    throw error
  }

  return z.array(activityRowSchema).parse(data).map(mapActivityRow)
}

async function listTripDays(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
): Promise<Array<Pick<TripDay, "date" | "title" | "notes">>> {
  const { data, error } = await client
    .from("trip_days")
    .select("trip_id, trip_date, title, notes")
    .eq("trip_id", tripId)

  if (error) {
    throw error
  }

  return z.array(tripDayRowSchema).parse(data).map(mapTripDayRow)
}

async function listHousingStays(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
): Promise<HousingStay[]> {
  const { data, error } = await client
    .from("housing_stays")
    .select(housingStayColumns)
    .eq("trip_id", tripId)
    .order("check_in", { ascending: true })

  if (error) {
    throw error
  }

  return z.array(housingStayRowSchema).parse(data).map(mapHousingStayRow)
}

async function listMeals(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
): Promise<Meal[]> {
  const { data, error } = await client
    .from("meals")
    .select(mealColumns)
    .eq("trip_id", tripId)
    .order("trip_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })

  if (error) {
    throw error
  }

  return z.array(mealRowSchema).parse(data).map(mapMealRow)
}

async function listTripItemPreferences(
  client: ReturnType<typeof createUserSupabaseClient>,
  tripId: string,
): Promise<TripItemPreference[]> {
  const { data, error } = await client
    .from("trip_item_preferences")
    .select("id, trip_id, user_id, activity_id, meal_id, housing_stay_id, value, updated_at")
    .eq("trip_id", tripId)

  if (error) {
    throw error
  }

  return z.array(tripItemPreferenceRowSchema).parse(data).map(mapTripItemPreferenceRow)
}

function mapTripItemDetailVisibilityRow(row: unknown): TripItemDetailVisibility {
  const parsedRow = tripItemDetailVisibilityRowSchema.parse(row)
  return TripItemDetailVisibilitySchema.parse({
    showPrice: parsedRow.show_price,
    showWebsite: parsedRow.show_website,
  })
}

function addActivitiesToDays(
  days: TripDetail["days"],
  activities: Activity[],
  tripDays: Array<Pick<TripDay, "date" | "title" | "notes">>,
): TripDetail["days"] {
  const activitiesByDate = new Map<string, Activity[]>()
  const dayDetailsByDate = new Map(tripDays.map((day) => [day.date, day]))

  for (const activity of activities) {
    if (activity.isBackup || !activity.tripDate) {
      continue
    }

    const dateActivities = activitiesByDate.get(activity.tripDate) ?? []
    dateActivities.push(activity)
    activitiesByDate.set(activity.tripDate, dateActivities)
  }

  return days.map((day) => ({
    ...day,
    title: dayDetailsByDate.get(day.date)?.title ?? null,
    notes: dayDetailsByDate.get(day.date)?.notes ?? null,
    activities: activitiesByDate.get(day.date) ?? [],
  }))
}

export function createSupabaseTripRepository(): TripRepository {
  return {
    async listTrips(userId, accessToken) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("trips")
        .select(tripColumns)
        .is("deleted_at", null)
        .order("start_date", { ascending: true })

      if (error) {
        throw error
      }

      return z.array(tripRowSchema).parse(data).map(mapTripRow)
    },

    async getTrip(userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("trips")
        .select(tripColumns)
        .eq("id", tripId)
        .is("deleted_at", null)
        .maybeSingle()

      if (error) {
        throw error
      }

      if (!data) {
        return null
      }

      const trip = mapTripRow(data)
      const [activities, tripDays, housingStays, meals, preferences, itemDetailVisibility] =
        await Promise.all([
          listActivities(client, tripId),
          listTripDays(client, tripId),
          listHousingStays(client, tripId),
          listMeals(client, tripId),
          listTripItemPreferences(client, tripId),
          this.getTripItemDetailVisibility(userId, accessToken, tripId),
        ])
      const backupActivities = activities.filter(
        (activity) => activity.isBackup || !activity.tripDate,
      )
      return TripDetailSchema.parse({
        ...trip,
        days: addActivitiesToDays(
          buildTripDays(trip),
          activities.filter((activity) => !activity.isBackup && activity.tripDate !== null),
          tripDays,
        ),
        backupActivities,
        housingStays,
        meals,
        preferences,
        itemDetailVisibility: itemDetailVisibility ?? { showPrice: true, showWebsite: true },
      })
    },

    async setTripItemPreference(userId, accessToken, tripId, input) {
      const parsedInput = SetTripItemPreferenceInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const itemTable =
        parsedInput.itemType === "activity"
          ? "activities"
          : parsedInput.itemType === "meal"
            ? "meals"
            : "housing_stays"
      const itemColumn = getPreferenceItemColumn(parsedInput.itemType)

      const { data: item, error: itemError } = await client
        .from(itemTable)
        .select("id")
        .eq("id", parsedInput.itemId)
        .eq("trip_id", tripId)
        .maybeSingle()

      if (itemError) {
        throw itemError
      }
      if (!item) {
        return null
      }

      const { data: existingRow, error: existingError } = await client
        .from("trip_item_preferences")
        .select("id, trip_id, user_id, activity_id, meal_id, housing_stay_id, value, updated_at")
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .eq(itemColumn, parsedInput.itemId)
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      if (parsedInput.value === null) {
        if (!existingRow) {
          return null
        }

        const { error: deleteError } = await client
          .from("trip_item_preferences")
          .delete()
          .eq("id", existingRow.id)

        if (deleteError) {
          throw deleteError
        }

        return null
      }

      const itemValues =
        parsedInput.itemType === "activity"
          ? { activity_id: parsedInput.itemId, meal_id: null, housing_stay_id: null }
          : parsedInput.itemType === "meal"
            ? { activity_id: null, meal_id: parsedInput.itemId, housing_stay_id: null }
            : { activity_id: null, meal_id: null, housing_stay_id: parsedInput.itemId }

      const result = existingRow
        ? await client
            .from("trip_item_preferences")
            .update({ value: parsedInput.value, updated_at: new Date().toISOString() })
            .eq("id", existingRow.id)
            .select(
              "id, trip_id, user_id, activity_id, meal_id, housing_stay_id, value, updated_at",
            )
            .single()
        : await client
            .from("trip_item_preferences")
            .insert({
              trip_id: tripId,
              user_id: userId,
              ...itemValues,
              value: parsedInput.value,
            })
            .select(
              "id, trip_id, user_id, activity_id, meal_id, housing_stay_id, value, updated_at",
            )
            .single()

      if (result.error) {
        throw result.error
      }

      return mapTripItemPreferenceRow(result.data)
    },

    async getTripCurrencies(_userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("trips")
        .select("id, accepted_currencies")
        .eq("id", tripId)
        .is("deleted_at", null)
        .maybeSingle()

      if (error) {
        throw error
      }
      if (!data) {
        return null
      }

      return TripCurrencySettingsSchema.parse({
        tripId: data.id,
        acceptedCurrencies: z.array(CurrencyCodeSchema).parse(data.accepted_currencies ?? []),
      })
    },

    async updateTripCurrencies(_userId, accessToken, tripId, input) {
      const parsedInput = UpdateTripCurrencySettingsInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      await ensureCurrenciesAreNotUsedByTripItems(client, tripId, parsedInput.acceptedCurrencies)
      const { data, error } = await client
        .from("trips")
        .update({
          accepted_currencies: parsedInput.acceptedCurrencies,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tripId)
        .is("deleted_at", null)
        .select("id, accepted_currencies")
        .maybeSingle()

      if (error) {
        throw error
      }
      if (!data) {
        return null
      }

      return TripCurrencySettingsSchema.parse({
        tripId: data.id,
        acceptedCurrencies: z.array(CurrencyCodeSchema).parse(data.accepted_currencies ?? []),
      })
    },

    async getTripItemDetailVisibility(userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const [{ data: trip, error: tripError }, { data, error }] = await Promise.all([
        client.from("trips").select("id").eq("id", tripId).is("deleted_at", null).maybeSingle(),
        client
          .from("trip_visibility_settings")
          .select("show_price, show_website")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .maybeSingle(),
      ])

      if (tripError) {
        throw tripError
      }
      if (error) {
        throw error
      }
      if (!trip) {
        return null
      }

      return data ? mapTripItemDetailVisibilityRow(data) : { showPrice: true, showWebsite: true }
    },

    async updateTripItemDetailVisibility(userId, accessToken, tripId, input) {
      const parsedInput = UpdateTripItemDetailVisibilityInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const { data: trip, error: tripError } = await client
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .is("deleted_at", null)
        .maybeSingle()

      if (tripError) {
        throw tripError
      }
      if (!trip) {
        return null
      }

      const { data, error } = await client
        .from("trip_visibility_settings")
        .upsert(
          {
            trip_id: tripId,
            user_id: userId,
            show_price: parsedInput.showPrice,
            show_website: parsedInput.showWebsite,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "trip_id,user_id" },
        )
        .select("show_price, show_website")
        .maybeSingle()

      if (error) {
        throw error
      }
      if (!data) {
        return null
      }

      return mapTripItemDetailVisibilityRow(data)
    },

    async createTrip(userId, accessToken, input, userEmail, userName) {
      const parsedInput = CreateTripInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const tripId = randomUUID()
      const { error } = await client.from("trips").insert({
        id: tripId,
        owner_id: userId,
        name: parsedInput.name,
        start_date: parsedInput.startDate,
        end_date: parsedInput.endDate,
        notes: parsedInput.notes,
        accepted_currencies: parsedInput.acceptedCurrencies ?? [],
      })

      if (error) {
        throw error
      }

      const { error: memberError } = await client.from("trip_members").insert({
        trip_id: tripId,
        user_id: userId,
        name: userName?.trim() || null,
        email: userEmail?.trim().toLowerCase() ?? null,
      })

      if (memberError) {
        throw memberError
      }

      const { data, error: readError } = await client
        .from("trips")
        .select("id, name, start_date, end_date, notes, accepted_currencies")
        .eq("id", tripId)
        .eq("owner_id", userId)
        .single()

      if (readError) {
        throw readError
      }

      return mapTripRow(data)
    },

    async updateTrip(userId, accessToken, tripId, input) {
      const currentTrip = await this.getTrip(userId, accessToken, tripId)

      if (!currentTrip) {
        return null
      }

      const parsedInput = UpdateTripInputSchema.parse(input)
      const updatedTrip = CreateTripInputSchema.parse({
        name: currentTrip.name,
        startDate: currentTrip.startDate,
        endDate: currentTrip.endDate,
        notes: currentTrip.notes,
        acceptedCurrencies: currentTrip.acceptedCurrencies ?? [],
        ...parsedInput,
      })
      const client = createUserSupabaseClient(accessToken)
      await ensureCurrenciesAreNotUsedByTripItems(
        client,
        tripId,
        updatedTrip.acceptedCurrencies ?? [],
      )
      const { error } = await client
        .from("trips")
        .update({
          name: updatedTrip.name,
          start_date: updatedTrip.startDate,
          end_date: updatedTrip.endDate,
          notes: updatedTrip.notes,
          accepted_currencies: updatedTrip.acceptedCurrencies ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", tripId)

      if (error) {
        throw error
      }

      return this.getTrip(userId, accessToken, tripId)
    },

    async deleteTrip(userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error: readError } = await client
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .maybeSingle()

      if (readError) {
        throw readError
      }

      if (!data) {
        return false
      }

      const { error } = await client
        .from("trips")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", tripId)
        .eq("owner_id", userId)

      if (error) {
        throw error
      }

      return true
    },

    async updateDay(userId, accessToken, tripId, tripDate, input) {
      const trip = await this.getTrip(userId, accessToken, tripId)

      if (!trip) {
        return null
      }

      const day = trip.days.find((currentDay) => currentDay.date === tripDate)

      if (!day) {
        return null
      }

      const parsedInput = UpdateTripDayInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("trip_days")
        .upsert(
          {
            trip_id: tripId,
            trip_date: tripDate,
            title: parsedInput.title === undefined ? day.title : parsedInput.title,
            notes: parsedInput.notes === undefined ? day.notes : parsedInput.notes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "trip_id,trip_date" },
        )
        .select("trip_id, trip_date, title, notes")
        .single()

      if (error) {
        throw error
      }

      const parsedDay = mapTripDayRow(data)
      return {
        ...day,
        title: parsedDay.title,
        notes: parsedDay.notes,
      }
    },

    async getHousingStay(_userId, accessToken, tripId, housingStayId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("housing_stays")
        .select(housingStayColumns)
        .eq("trip_id", tripId)
        .eq("id", housingStayId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data ? mapHousingStayRow(data) : null
    },

    async createHousingStay(_userId, accessToken, tripId, input) {
      const parsedInput = CreateHousingStayInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const housingStayId = randomUUID()
      const { error } = await client.from("housing_stays").insert({
        id: housingStayId,
        trip_id: tripId,
        name: parsedInput.name,
        check_in: parsedInput.checkIn,
        check_out: parsedInput.checkOut,
        is_backup: parsedInput.isBackup,
        notes: parsedInput.notes,
        google_maps_url: parsedInput.googleMapsUrl,
        place_name: parsedInput.placeName,
        place_address: parsedInput.placeAddress,
        latitude: parsedInput.latitude,
        longitude: parsedInput.longitude,
        price_amount: parsedInput.priceAmount,
        price_currency: parsedInput.priceCurrency,
        website: parsedInput.website,
      })

      if (error) {
        throw error
      }

      const { data, error: readError } = await client
        .from("housing_stays")
        .select(housingStayColumns)
        .eq("trip_id", tripId)
        .eq("id", housingStayId)
        .single()

      if (readError) {
        throw readError
      }

      return mapHousingStayRow(data)
    },

    async updateHousingStay(_userId, accessToken, tripId, housingStayId, input) {
      const client = createUserSupabaseClient(accessToken)
      const currentStay = await this.getHousingStay(_userId, accessToken, tripId, housingStayId)

      if (!currentStay) {
        return null
      }

      const parsedInput = CreateHousingStayInputSchema.parse({
        name: currentStay.name,
        checkIn: currentStay.checkIn,
        checkOut: currentStay.checkOut,
        isBackup: currentStay.isBackup,
        notes: currentStay.notes,
        googleMapsUrl: currentStay.googleMapsUrl,
        placeName: currentStay.placeName,
        placeAddress: currentStay.placeAddress,
        latitude: currentStay.latitude,
        longitude: currentStay.longitude,
        priceAmount: currentStay.priceAmount,
        priceCurrency: currentStay.priceCurrency,
        website: currentStay.website,
        ...input,
      })
      const { error } = await client
        .from("housing_stays")
        .update({
          name: parsedInput.name,
          check_in: parsedInput.checkIn,
          check_out: parsedInput.checkOut,
          is_backup: parsedInput.isBackup,
          notes: parsedInput.notes,
          google_maps_url: parsedInput.googleMapsUrl,
          place_name: parsedInput.placeName,
          place_address: parsedInput.placeAddress,
          latitude: parsedInput.latitude,
          longitude: parsedInput.longitude,
          price_amount: parsedInput.priceAmount,
          price_currency: parsedInput.priceCurrency,
          website: parsedInput.website,
        })
        .eq("trip_id", tripId)
        .eq("id", housingStayId)

      if (error) {
        throw error
      }

      return this.getHousingStay(_userId, accessToken, tripId, housingStayId)
    },

    async deleteHousingStay(_userId, accessToken, tripId, housingStayId) {
      const client = createUserSupabaseClient(accessToken)
      const currentStay = await this.getHousingStay(_userId, accessToken, tripId, housingStayId)

      if (!currentStay) {
        return false
      }

      const { error } = await client
        .from("housing_stays")
        .delete()
        .eq("trip_id", tripId)
        .eq("id", housingStayId)

      if (error) {
        throw error
      }

      return true
    },

    async getMeal(_userId, accessToken, tripId, mealId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client
        .from("meals")
        .select(mealColumns)
        .eq("trip_id", tripId)
        .eq("id", mealId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data ? mapMealRow(data) : null
    },

    async createMeal(_userId, accessToken, tripId, input) {
      const parsedInput = CreateMealInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const mealId = randomUUID()
      const highestSortOrder =
        parsedInput.isBackup || !parsedInput.tripDate
          ? -1
          : await getHighestDayItemSortOrder(client, tripId, parsedInput.tripDate)
      const { error } = await client.from("meals").insert({
        id: mealId,
        trip_id: tripId,
        trip_date: parsedInput.tripDate,
        is_backup: parsedInput.isBackup,
        title: parsedInput.title,
        start_time: parsedInput.startTime,
        end_time: parsedInput.endTime,
        all_day: parsedInput.allDay,
        notes: parsedInput.notes,
        google_maps_url: parsedInput.googleMapsUrl,
        place_name: parsedInput.placeName,
        place_address: parsedInput.placeAddress,
        latitude: parsedInput.latitude,
        longitude: parsedInput.longitude,
        price_amount: parsedInput.priceAmount,
        price_currency: parsedInput.priceCurrency,
        website: parsedInput.website,
        sort_order: highestSortOrder + 1,
      })

      if (error) {
        throw error
      }

      const { data, error: readError } = await client
        .from("meals")
        .select(mealColumns)
        .eq("trip_id", tripId)
        .eq("id", mealId)
        .single()

      if (readError) {
        throw readError
      }

      return mapMealRow(data)
    },

    async updateMeal(_userId, accessToken, tripId, mealId, input) {
      const client = createUserSupabaseClient(accessToken)
      const currentMeal = await this.getMeal(_userId, accessToken, tripId, mealId)

      if (!currentMeal) {
        return null
      }

      const parsedInput = CreateMealInputSchema.parse({
        tripDate: currentMeal.tripDate,
        isBackup: currentMeal.isBackup,
        title: currentMeal.title,
        startTime: currentMeal.startTime,
        endTime: currentMeal.endTime,
        allDay: currentMeal.allDay,
        notes: currentMeal.notes,
        googleMapsUrl: currentMeal.googleMapsUrl,
        placeName: currentMeal.placeName,
        placeAddress: currentMeal.placeAddress,
        latitude: currentMeal.latitude,
        longitude: currentMeal.longitude,
        priceAmount: currentMeal.priceAmount,
        priceCurrency: currentMeal.priceCurrency,
        website: currentMeal.website,
        ...input,
      })
      const { error } = await client
        .from("meals")
        .update({
          trip_date: parsedInput.tripDate,
          is_backup: parsedInput.isBackup,
          title: parsedInput.title,
          start_time: parsedInput.startTime,
          end_time: parsedInput.endTime,
          all_day: parsedInput.allDay,
          notes: parsedInput.notes,
          google_maps_url: parsedInput.googleMapsUrl,
          place_name: parsedInput.placeName,
          place_address: parsedInput.placeAddress,
          latitude: parsedInput.latitude,
          longitude: parsedInput.longitude,
          price_amount: parsedInput.priceAmount,
          price_currency: parsedInput.priceCurrency,
          website: parsedInput.website,
        })
        .eq("trip_id", tripId)
        .eq("id", mealId)

      if (error) {
        throw error
      }

      return this.getMeal(_userId, accessToken, tripId, mealId)
    },

    async deleteMeal(_userId, accessToken, tripId, mealId) {
      const client = createUserSupabaseClient(accessToken)
      const currentMeal = await this.getMeal(_userId, accessToken, tripId, mealId)

      if (!currentMeal) {
        return false
      }

      const { error } = await client.from("meals").delete().eq("trip_id", tripId).eq("id", mealId)

      if (error) {
        throw error
      }

      return true
    },

    async getActivity(_userId, accessToken, tripId, activityId) {
      return selectActivity(createUserSupabaseClient(accessToken), tripId, activityId)
    },

    async createActivity(_userId, accessToken, tripId, input) {
      const parsedInput = CreateActivityInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const activityId = randomUUID()
      const highestSortOrder =
        parsedInput.isBackup || !parsedInput.tripDate
          ? -1
          : await getHighestDayItemSortOrder(client, tripId, parsedInput.tripDate)
      const { error } = await client.from("activities").insert({
        id: activityId,
        trip_id: tripId,
        trip_date: parsedInput.tripDate,
        is_backup: parsedInput.isBackup,
        title: parsedInput.title,
        start_time: parsedInput.startTime,
        end_time: parsedInput.endTime,
        all_day: parsedInput.allDay,
        notes: parsedInput.notes,
        google_maps_url: parsedInput.googleMapsUrl,
        place_name: parsedInput.placeName,
        place_address: parsedInput.placeAddress,
        latitude: parsedInput.latitude,
        longitude: parsedInput.longitude,
        price_amount: parsedInput.priceAmount,
        price_currency: parsedInput.priceCurrency,
        website: parsedInput.website,
        sort_order: highestSortOrder + 1,
      })

      if (error) {
        throw error
      }

      return selectActivity(client, tripId, activityId)
    },

    async updateActivity(_userId, accessToken, tripId, activityId, input) {
      const client = createUserSupabaseClient(accessToken)
      const currentActivity = await selectActivity(client, tripId, activityId)

      if (!currentActivity) {
        return null
      }

      const parsedInput = CreateActivityInputSchema.parse({
        tripDate: currentActivity.tripDate,
        isBackup: currentActivity.isBackup,
        title: currentActivity.title,
        startTime: currentActivity.startTime,
        endTime: currentActivity.endTime,
        allDay: currentActivity.allDay,
        notes: currentActivity.notes,
        googleMapsUrl: currentActivity.googleMapsUrl,
        placeName: currentActivity.placeName,
        placeAddress: currentActivity.placeAddress,
        latitude: currentActivity.latitude,
        longitude: currentActivity.longitude,
        priceAmount: currentActivity.priceAmount,
        priceCurrency: currentActivity.priceCurrency,
        website: currentActivity.website,
        ...input,
      })
      const parsedUpdateInput = UpdateActivityInputSchema.parse(input)
      const { error } = await client
        .from("activities")
        .update({
          trip_date: parsedInput.tripDate,
          is_backup: parsedInput.isBackup,
          title: parsedInput.title,
          start_time: parsedInput.startTime,
          end_time: parsedInput.endTime,
          all_day: parsedInput.allDay,
          notes: parsedInput.notes,
          google_maps_url: parsedInput.googleMapsUrl,
          place_name: parsedInput.placeName,
          place_address: parsedInput.placeAddress,
          latitude: parsedInput.latitude,
          longitude: parsedInput.longitude,
          price_amount: parsedInput.priceAmount,
          price_currency: parsedInput.priceCurrency,
          website: parsedInput.website,
          sort_order: parsedUpdateInput.sortOrder ?? currentActivity.sortOrder,
        })
        .eq("trip_id", tripId)
        .eq("id", activityId)

      if (error) {
        throw error
      }

      return selectActivity(client, tripId, activityId)
    },

    async reorderActivities(_userId, accessToken, tripId, input) {
      const parsedInput = ReorderActivitiesInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const currentActivities = await listActivities(client, tripId)
      const currentActivityIds = new Set(currentActivities.map((activity) => activity.id))

      if (parsedInput.activities.some((activity) => !currentActivityIds.has(activity.activityId))) {
        return null
      }

      const updatedActivities = await Promise.all(
        parsedInput.activities.map(async (activity) => {
          const { data, error } = await client
            .from("activities")
            .update({
              trip_date: activity.tripDate,
              sort_order: activity.sortOrder,
            })
            .eq("trip_id", tripId)
            .eq("id", activity.activityId)
            .select(activityColumns)
            .single()

          if (error) {
            throw error
          }

          return mapActivityRow(data)
        }),
      )

      return updatedActivities
    },

    async reorderDayItems(_userId, accessToken, tripId, input) {
      const parsedInput = ReorderDayItemsInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      const [currentActivities, currentMeals] = await Promise.all([
        listActivities(client, tripId),
        listMeals(client, tripId),
      ])
      const currentItemKeys = new Set([
        ...currentActivities.map((activity) => `activity:${activity.id}`),
        ...currentMeals.map((meal) => `meal:${meal.id}`),
      ])

      if (
        parsedInput.items.some((item) => !currentItemKeys.has(`${item.itemType}:${item.itemId}`))
      ) {
        return null
      }

      const updatedActivities = await Promise.all(
        parsedInput.items
          .filter((item) => item.itemType === "activity")
          .map(async (item) => {
            const currentActivity = currentActivities.find(
              (activity) => activity.id === item.itemId,
            )
            const { data, error } = await client
              .from("activities")
              .update({
                trip_date: item.tripDate,
                sort_order: item.sortOrder,
                ...(item.startTime !== undefined
                  ? { start_time: item.startTime }
                  : { start_time: currentActivity?.startTime }),
                ...(item.endTime !== undefined
                  ? { end_time: item.endTime }
                  : { end_time: currentActivity?.endTime }),
              })
              .eq("trip_id", tripId)
              .eq("id", item.itemId)
              .select(activityColumns)
              .single()

            if (error) {
              throw error
            }

            return mapActivityRow(data)
          }),
      )
      const updatedMeals = await Promise.all(
        parsedInput.items
          .filter((item) => item.itemType === "meal")
          .map(async (item) => {
            const currentMeal = currentMeals.find((meal) => meal.id === item.itemId)
            const { data, error } = await client
              .from("meals")
              .update({
                trip_date: item.tripDate,
                sort_order: item.sortOrder,
                ...(item.startTime !== undefined
                  ? { start_time: item.startTime }
                  : { start_time: currentMeal?.startTime }),
                ...(item.endTime !== undefined
                  ? { end_time: item.endTime }
                  : { end_time: currentMeal?.endTime }),
              })
              .eq("trip_id", tripId)
              .eq("id", item.itemId)
              .select(mealColumns)
              .single()

            if (error) {
              throw error
            }

            return mapMealRow(data)
          }),
      )

      return { activities: updatedActivities, meals: updatedMeals }
    },

    async getTripSharing(userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const ownerId = await getTripOwnerId(client, tripId)

      if (!ownerId) {
        return null
      }

      const [
        { data: memberRows, error: membersError },
        { data: invitationRows, error: invitationsError },
        { data: requestRows, error: requestsError },
      ] = await Promise.all([
        client
          .from("trip_members")
          .select("trip_id, user_id, name, email, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: true }),
        client
          .from("trip_invitations")
          .select("id, trip_id, email, status, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
        client
          .from("trip_access_requests")
          .select("id, trip_id, requester_id, requester_name, email, source, status, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
      ])

      if (membersError) {
        throw membersError
      }
      if (invitationsError) {
        throw invitationsError
      }
      if (requestsError) {
        throw requestsError
      }

      let accessLinks: TripAccessLink[] = []
      if (ownerId === userId) {
        const { data: linkRows, error: linksError } = await client
          .from("trip_access_links")
          .select("id, trip_id, token, revoked_at, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false })

        if (linksError) {
          throw linksError
        }

        accessLinks = z.array(tripAccessLinkRowSchema).parse(linkRows).map(mapTripAccessLinkRow)
      }

      return TripSharingSchema.parse({
        ownerId,
        canManage: ownerId === userId,
        members: z
          .array(tripMemberRowSchema)
          .parse(memberRows)
          .map((member) => mapTripMemberRow(member, ownerId)),
        invitations: z
          .array(tripInvitationRowSchema)
          .parse(invitationRows)
          .map(mapTripInvitationRow),
        requests: z
          .array(tripAccessRequestRowSchema)
          .parse(requestRows)
          .map(mapTripAccessRequestRow),
        accessLinks,
      })
    },

    async getTripOwnerEmail(_userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      const { data, error } = await client.rpc("get_trip_owner_email", {
        target_trip_id: tripId,
      })

      if (error) {
        throw error
      }

      return data ? z.string().email().parse(data) : null
    },

    async getTripAccessStatus(userId, accessToken, tripId) {
      const trip = await this.getTrip(userId, accessToken, tripId)
      if (trip) {
        return mapTripAccessStatus("approved")
      }

      const client = createUserSupabaseClient(accessToken)
      const request = await getLatestTripAccessRequest(client, userId, tripId)
      return mapTripAccessStatus(
        request?.status === "approved" ? "none" : (request?.status ?? "none"),
      )
    },

    async createTripInvitation(userId, accessToken, tripId, input) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const parsedInput = InviteTripMemberInputSchema.parse(input)
      const { data, error } = await client
        .from("trip_invitations")
        .insert({
          trip_id: tripId,
          inviter_id: userId,
          email: parsedInput.email.toLowerCase(),
        })
        .select("id, trip_id, email, status, created_at")
        .single()

      if (error) {
        throw error
      }

      return mapTripInvitationRow(data)
    },

    async createTripAccessLink(userId, accessToken, tripId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const { data, error } = await client
        .from("trip_access_links")
        .insert({
          trip_id: tripId,
          created_by: userId,
          token: randomUUID(),
        })
        .select("id, trip_id, token, revoked_at, created_at")
        .single()

      if (error) {
        throw error
      }

      return mapTripAccessLinkRow(data)
    },

    async requestTripAccess(userId, accessToken, tripId, email, requesterName, input) {
      const parsedInput = RequestTripAccessInputSchema.parse(input)
      const client = createUserSupabaseClient(accessToken)
      if (await this.getTrip(userId, accessToken, tripId)) {
        return mapTripAccessStatus("approved")
      }

      const existingRequest = await getLatestTripAccessRequest(client, userId, tripId)
      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return mapTripAccessStatus("pending")
        }
        if (existingRequest.status === "denied") {
          return mapTripAccessStatus("denied")
        }
      }

      let source: "email" | "link"
      let invitationId: string | null = null
      let accessLinkId: string | null = null

      if (parsedInput.invitationId) {
        const { data, error } = await client
          .from("trip_invitations")
          .select("id, trip_id, email, status, created_at")
          .eq("id", parsedInput.invitationId)
          .eq("trip_id", tripId)
          .maybeSingle()

        if (error) {
          throw error
        }

        const invitation = data ? tripInvitationRowSchema.parse(data) : null
        if (
          !invitation ||
          invitation.status !== "pending" ||
          invitation.email.toLowerCase() !== email.toLowerCase()
        ) {
          return null
        }

        source = "email"
        invitationId = invitation.id
      } else if (parsedInput.accessLinkToken) {
        const { data, error } = await client.rpc("get_trip_access_link", {
          target_trip_id: tripId,
          target_token: parsedInput.accessLinkToken,
        })

        if (error) {
          throw error
        }
        const link = z.array(tripAccessLinkRowSchema).parse(data)
        if (link.length === 0) {
          return null
        }

        source = "link"
        accessLinkId = link[0].id
      } else {
        return null
      }

      const { data, error } = await client
        .from("trip_access_requests")
        .insert({
          trip_id: tripId,
          requester_id: userId,
          requester_name: requesterName?.trim() || null,
          email: email.toLowerCase(),
          source,
          invitation_id: invitationId,
          access_link_id: accessLinkId,
        })
        .select("id, trip_id, requester_id, requester_name, email, source, status, created_at")
        .single()

      if (error) {
        if (error.code === "23505") {
          const request = await getLatestTripAccessRequest(client, userId, tripId)
          if (request) {
            return mapTripAccessStatus(request.status)
          }
        }
        throw error
      }

      mapTripAccessRequestRow(data)
      return mapTripAccessStatus("pending", true)
    },

    async approveTripAccessRequest(userId, accessToken, tripId, requestId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const { data: requestData, error: requestError } = await client
        .from("trip_access_requests")
        .select(
          "id, trip_id, requester_id, requester_name, email, source, status, created_at, invitation_id",
        )
        .eq("id", requestId)
        .eq("trip_id", tripId)
        .maybeSingle()

      if (requestError) {
        throw requestError
      }
      if (!requestData) {
        return null
      }

      const request = z
        .object({
          id: z.string(),
          trip_id: z.string(),
          requester_id: z.string(),
          requester_name: z.string().nullable(),
          email: z.string(),
          source: z.enum(["email", "link"]),
          status: z.enum(["pending", "approved", "denied"]),
          created_at: databaseDateTimeSchema,
          invitation_id: z.string().nullable(),
        })
        .parse(requestData)

      if (request.status !== "pending") {
        return null
      }

      const { data: existingMember, error: memberLookupError } = await client
        .from("trip_members")
        .select("trip_id, user_id, name, email, created_at")
        .eq("trip_id", tripId)
        .eq("user_id", request.requester_id)
        .maybeSingle()

      if (memberLookupError) {
        throw memberLookupError
      }

      let memberRow = existingMember
      if (!memberRow) {
        const { data: insertedMember, error: memberError } = await client
          .from("trip_members")
          .insert({
            trip_id: tripId,
            user_id: request.requester_id,
            name: request.requester_name,
            email: request.email,
          })
          .select("trip_id, user_id, name, email, created_at")
          .single()

        if (memberError) {
          throw memberError
        }
        memberRow = insertedMember
      }

      const { error: updateError } = await client
        .from("trip_access_requests")
        .update({ status: "approved" })
        .eq("id", requestId)
        .eq("trip_id", tripId)

      if (updateError) {
        throw updateError
      }

      if (request.invitation_id) {
        const { error: invitationError } = await client
          .from("trip_invitations")
          .update({ status: "accepted" })
          .eq("id", request.invitation_id)
          .eq("trip_id", tripId)

        if (invitationError) {
          throw invitationError
        }
      }

      return mapTripMemberRow(memberRow, userId)
    },

    async denyTripAccessRequest(userId, accessToken, tripId, requestId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const { data, error } = await client
        .from("trip_access_requests")
        .update({ status: "denied" })
        .eq("id", requestId)
        .eq("trip_id", tripId)
        .eq("status", "pending")
        .select("id, trip_id, requester_id, requester_name, email, source, status, created_at")
        .maybeSingle()

      if (error) {
        throw error
      }
      return data ? mapTripAccessRequestRow(data) : null
    },

    async revokeTripInvitation(userId, accessToken, tripId, invitationId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const { data, error } = await client
        .from("trip_invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId)
        .eq("trip_id", tripId)
        .eq("status", "pending")
        .select("id, trip_id, email, status, created_at")
        .maybeSingle()

      if (error) {
        throw error
      }
      return data ? mapTripInvitationRow(data) : null
    },

    async revokeTripAccessLink(userId, accessToken, tripId, linkId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId) {
        return null
      }

      const { data, error } = await client
        .from("trip_access_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId)
        .eq("trip_id", tripId)
        .is("revoked_at", null)
        .select("id, trip_id, token, revoked_at, created_at")
        .maybeSingle()

      if (error) {
        throw error
      }
      return data ? mapTripAccessLinkRow(data) : null
    },

    async removeTripMember(userId, accessToken, tripId, memberId) {
      const client = createUserSupabaseClient(accessToken)
      if ((await getTripOwnerId(client, tripId)) !== userId || memberId === userId) {
        return null
      }

      const { data: member, error: memberError } = await client
        .from("trip_members")
        .select("email")
        .eq("trip_id", tripId)
        .eq("user_id", memberId)
        .maybeSingle()

      if (memberError) {
        throw memberError
      }
      if (!member) {
        return null
      }

      const { error } = await client
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", memberId)

      if (error) {
        throw error
      }

      return { email: z.object({ email: z.string().email().nullable() }).parse(member).email }
    },

    async deleteActivity(_userId, accessToken, tripId, activityId) {
      const client = createUserSupabaseClient(accessToken)
      const currentActivity = await selectActivity(client, tripId, activityId)

      if (!currentActivity) {
        return false
      }

      const { error } = await client
        .from("activities")
        .delete()
        .eq("trip_id", tripId)
        .eq("id", activityId)

      if (error) {
        throw error
      }

      return true
    },
  }
}
