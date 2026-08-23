import { z } from "zod"
import { TripItemPreferenceSchema } from "./preferences.js"

export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const MAX_TRIP_DAYS = 60

function parseCalendarDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  if (!DateOnlySchema.safeParse(date).success || parsedDate.toISOString().slice(0, 10) !== date) {
    return null
  }

  return parsedDate
}

export function getTripDurationInDays(startDate: string, endDate: string): number | null {
  const start = parseCalendarDate(startDate)
  const end = parseCalendarDate(endDate)

  if (!start || !end || end < start) {
    return null
  }

  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function isTripDurationWithinLimit(startDate: string, endDate: string): boolean {
  const duration = getTripDurationInDays(startDate, endDate)
  return duration !== null && duration <= MAX_TRIP_DAYS
}

export const TimeOnlySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const NoteSchema = z.string().trim().max(2000).nullable()
export const DayTitleSchema = z.string().trim().min(1).max(200).nullable()
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase())
export const PriceAmountSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
    message: "Price amount must have at most two decimal places",
  })
export const WebsiteSchema = z.string().trim().max(2000).nullable()

const ItemDetailsSchema = z.object({
  priceAmount: PriceAmountSchema.nullable().default(null),
  priceCurrency: CurrencyCodeSchema.nullable().default(null),
  website: WebsiteSchema.default(null),
})

export const AcceptedCurrenciesSchema = CurrencyCodeSchema.array()
  .max(50)
  .refine((currencies) => new Set(currencies).size === currencies.length, {
    message: "Accepted currencies must be unique",
  })

export const TripSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  notes: NoteSchema,
  acceptedCurrencies: AcceptedCurrenciesSchema.optional(),
})

export const CreateTripInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  notes: NoteSchema.optional().default(null),
  acceptedCurrencies: AcceptedCurrenciesSchema.optional(),
})

export const UpdateTripInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  startDate: DateOnlySchema.optional(),
  endDate: DateOnlySchema.optional(),
  notes: NoteSchema.optional(),
  acceptedCurrencies: AcceptedCurrenciesSchema.optional(),
})

const ActivityFieldsSchema = z
  .object({
    tripDate: DateOnlySchema.nullable().optional().default(null),
    isBackup: z.boolean().default(false),
    title: z.string().trim().max(200).nullable(),
    startTime: TimeOnlySchema.nullable(),
    endTime: TimeOnlySchema.nullable(),
    allDay: z.boolean(),
    notes: z.string().trim().max(2000).nullable(),
  })
  .merge(ItemDetailsSchema)

const ActivityPlaceSchema = z.object({
  googleMapsUrl: z.string().url().nullable(),
  placeName: z.string().trim().max(200).nullable(),
  placeAddress: z.string().trim().max(500).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
})

function hasValidTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  return !startTime || !endTime || endTime >= startTime
}

function hasValidPrice(details: { priceAmount?: number | null; priceCurrency?: string | null }) {
  return (details.priceAmount == null) === (details.priceCurrency == null)
}

export const ActivitySchema = ActivityFieldsSchema.extend({
  id: z.string(),
  tripId: z.string(),
  sortOrder: z.number().int(),
}).merge(ActivityPlaceSchema)

export const CreateActivityInputSchema = ActivityFieldsSchema.extend({
  googleMapsUrl: z.string().url().nullable().optional().default(null),
  placeName: z.string().trim().max(200).nullable().optional().default(null),
  placeAddress: z.string().trim().max(500).nullable().optional().default(null),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
})
  .refine(
    (activity) => Boolean(activity.title?.trim()) || Boolean(activity.googleMapsUrl),
    "An activity title or Google Maps link is required",
  )
  .refine(
    (activity) => activity.isBackup || activity.tripDate !== null,
    "A planned activity must have a date",
  )
  .refine(
    (activity) => hasValidTimeRange(activity.startTime, activity.endTime),
    "End time must be on or after start time",
  )
  .refine(hasValidPrice, "A price amount and currency must be provided together")

export const UpdateActivityInputSchema = z
  .object({
    tripDate: DateOnlySchema.nullable().optional(),
    isBackup: z.boolean().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    startTime: TimeOnlySchema.nullable().optional(),
    endTime: TimeOnlySchema.nullable().optional(),
    allDay: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    googleMapsUrl: z.string().url().nullable().optional(),
    placeName: z.string().trim().max(200).nullable().optional(),
    placeAddress: z.string().trim().max(500).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    priceAmount: PriceAmountSchema.nullable().optional(),
    priceCurrency: CurrencyCodeSchema.nullable().optional(),
    website: WebsiteSchema.optional(),
  })
  .refine(
    (activity) => hasValidTimeRange(activity.startTime, activity.endTime),
    "End time must be on or after start time",
  )

export const ReorderActivityInputSchema = z.object({
  activityId: z.string().min(1),
  tripDate: DateOnlySchema,
  sortOrder: z.number().int().nonnegative(),
})

export const ReorderActivitiesInputSchema = z.object({
  activities: ReorderActivityInputSchema.array().min(1),
})

const HousingStayFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    checkIn: DateOnlySchema.nullable().optional().default(null),
    checkOut: DateOnlySchema.nullable().optional().default(null),
    isBackup: z.boolean().default(false),
    notes: NoteSchema,
  })
  .merge(ItemDetailsSchema)

export const HousingStaySchema = HousingStayFieldsSchema.extend({
  id: z.string(),
  tripId: z.string(),
}).merge(ActivityPlaceSchema)

export const CreateHousingStayInputSchema = HousingStayFieldsSchema.extend({
  name: z.string().trim().max(200).optional().default(""),
  googleMapsUrl: z.string().url().nullable().optional().default(null),
  placeName: z.string().trim().max(200).nullable().optional().default(null),
  placeAddress: z.string().trim().max(500).nullable().optional().default(null),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
})
  .refine(
    (stay) =>
      stay.isBackup ||
      (stay.checkIn !== null && stay.checkOut !== null && stay.checkOut > stay.checkIn),
    "A planned housing stay must have a valid date range",
  )
  .refine(
    (stay) => stay.name.length > 0 || stay.googleMapsUrl !== null,
    "A housing stay must have a name or Google Maps link",
  )
  .refine(hasValidPrice, "A price amount and currency must be provided together")

export const UpdateHousingStayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    checkIn: DateOnlySchema.nullable().optional(),
    checkOut: DateOnlySchema.nullable().optional(),
    isBackup: z.boolean().optional(),
    notes: NoteSchema.optional(),
    googleMapsUrl: z.string().url().nullable().optional(),
    placeName: z.string().trim().max(200).nullable().optional(),
    placeAddress: z.string().trim().max(500).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    priceAmount: PriceAmountSchema.nullable().optional(),
    priceCurrency: CurrencyCodeSchema.nullable().optional(),
    website: WebsiteSchema.optional(),
  })
  .refine(
    (stay) =>
      stay.checkIn === undefined ||
      stay.checkOut === undefined ||
      stay.checkIn === null ||
      stay.checkOut === null ||
      stay.checkOut > stay.checkIn,
    "Check-out must be after check-in",
  )

const MealFieldsSchema = z
  .object({
    tripDate: DateOnlySchema.nullable().optional().default(null),
    isBackup: z.boolean().default(false),
    title: z.string().trim().max(200).nullable(),
    startTime: TimeOnlySchema.nullable(),
    endTime: TimeOnlySchema.nullable(),
    allDay: z.boolean(),
    notes: NoteSchema,
  })
  .merge(ItemDetailsSchema)

export const MealSchema = MealFieldsSchema.extend({
  id: z.string(),
  tripId: z.string(),
  sortOrder: z.number().int(),
}).merge(ActivityPlaceSchema)

export const CreateMealInputSchema = MealFieldsSchema.extend({
  googleMapsUrl: z.string().url().nullable().optional().default(null),
  placeName: z.string().trim().max(200).nullable().optional().default(null),
  placeAddress: z.string().trim().max(500).nullable().optional().default(null),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
})
  .refine(
    (meal) => Boolean(meal.title?.trim()) || Boolean(meal.googleMapsUrl),
    "A meal title or Google Maps link is required",
  )
  .refine((meal) => meal.isBackup || meal.tripDate !== null, "A planned meal must have a date")
  .refine(
    (meal) => hasValidTimeRange(meal.startTime, meal.endTime),
    "End time must be on or after start time",
  )
  .refine(hasValidPrice, "A price amount and currency must be provided together")

export const UpdateMealInputSchema = z
  .object({
    tripDate: DateOnlySchema.nullable().optional(),
    isBackup: z.boolean().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    startTime: TimeOnlySchema.nullable().optional(),
    endTime: TimeOnlySchema.nullable().optional(),
    allDay: z.boolean().optional(),
    notes: NoteSchema.optional(),
    googleMapsUrl: z.string().url().nullable().optional(),
    placeName: z.string().trim().max(200).nullable().optional(),
    placeAddress: z.string().trim().max(500).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    priceAmount: PriceAmountSchema.nullable().optional(),
    priceCurrency: CurrencyCodeSchema.nullable().optional(),
    website: WebsiteSchema.optional(),
  })
  .refine(
    (meal) => hasValidTimeRange(meal.startTime, meal.endTime),
    "End time must be on or after start time",
  )

export const TripDaySchema = z.object({
  date: DateOnlySchema,
  dayNumber: z.number().int().positive(),
  title: DayTitleSchema,
  notes: NoteSchema,
  activities: ActivitySchema.array().default([]),
})

export const UpdateTripDayInputSchema = z.object({
  title: DayTitleSchema.optional(),
  notes: NoteSchema.optional(),
})

export const TripItemDetailVisibilitySchema = z.object({
  showPrice: z.boolean(),
  showWebsite: z.boolean(),
})

export const TripDetailSchema = TripSchema.extend({
  acceptedCurrencies: AcceptedCurrenciesSchema.default([]),
  days: TripDaySchema.array(),
  backupActivities: ActivitySchema.array().default([]),
  housingStays: HousingStaySchema.array().default([]),
  meals: MealSchema.array().default([]),
  preferences: TripItemPreferenceSchema.array().default([]),
  itemDetailVisibility: TripItemDetailVisibilitySchema,
})

export const TripCurrencySettingsSchema = z.object({
  tripId: z.string(),
  acceptedCurrencies: AcceptedCurrenciesSchema,
})

export const UpdateTripCurrencySettingsInputSchema = z.object({
  acceptedCurrencies: AcceptedCurrenciesSchema,
})

export const UpdateTripItemDetailVisibilityInputSchema = TripItemDetailVisibilitySchema

export const DayItemTypeSchema = z.enum(["activity", "meal"])

export const ReorderDayItemInputSchema = z.object({
  itemType: DayItemTypeSchema,
  itemId: z.string().min(1),
  tripDate: DateOnlySchema.nullable(),
  sortOrder: z.number().int().nonnegative(),
  startTime: TimeOnlySchema.nullable().optional(),
  endTime: TimeOnlySchema.nullable().optional(),
})

export const ReorderDayItemsInputSchema = z.object({
  items: ReorderDayItemInputSchema.array().min(1),
})

export const ReorderedDayItemsSchema = z.object({
  activities: ActivitySchema.array(),
  meals: MealSchema.array(),
})

export type Trip = z.infer<typeof TripSchema>
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>
export type AcceptedCurrencies = z.infer<typeof AcceptedCurrenciesSchema>
export type PriceAmount = z.infer<typeof PriceAmountSchema>
export type Website = z.infer<typeof WebsiteSchema>
export type CreateTripInput = z.infer<typeof CreateTripInputSchema>
export type UpdateTripInput = z.infer<typeof UpdateTripInputSchema>
export type Activity = z.infer<typeof ActivitySchema>
export type CreateActivityInput = z.infer<typeof CreateActivityInputSchema>
export type UpdateActivityInput = z.infer<typeof UpdateActivityInputSchema>
export type ReorderActivityInput = z.infer<typeof ReorderActivityInputSchema>
export type ReorderActivitiesInput = z.infer<typeof ReorderActivitiesInputSchema>
export type HousingStay = z.infer<typeof HousingStaySchema>
export type CreateHousingStayInput = z.infer<typeof CreateHousingStayInputSchema>
export type UpdateHousingStayInput = z.infer<typeof UpdateHousingStayInputSchema>
export type Meal = z.infer<typeof MealSchema>
export type CreateMealInput = z.infer<typeof CreateMealInputSchema>
export type UpdateMealInput = z.infer<typeof UpdateMealInputSchema>
export type DayItemType = z.infer<typeof DayItemTypeSchema>
export type ReorderDayItemInput = z.infer<typeof ReorderDayItemInputSchema>
export type ReorderDayItemsInput = z.infer<typeof ReorderDayItemsInputSchema>
export type TripDay = z.infer<typeof TripDaySchema>
export type UpdateTripDayInput = z.infer<typeof UpdateTripDayInputSchema>
export type TripDetail = z.infer<typeof TripDetailSchema>
export type TripItemDetailVisibility = z.infer<typeof TripItemDetailVisibilitySchema>
export type UpdateTripItemDetailVisibilityInput = z.infer<
  typeof UpdateTripItemDetailVisibilityInputSchema
>
export type TripCurrencySettings = z.infer<typeof TripCurrencySettingsSchema>
export type UpdateTripCurrencySettingsInput = z.infer<typeof UpdateTripCurrencySettingsInputSchema>
