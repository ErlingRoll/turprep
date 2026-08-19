import assert from "node:assert/strict"
import { test } from "node:test"
import request from "supertest"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import type {
  Activity,
  CreateActivityInput,
  CreateHousingStayInput,
  CreateMealInput,
  CreateTripInput,
  HousingStay,
  Meal,
  Trip,
  TripDetail,
  TripAccessLink,
  TripItemPreference,
  TripSharing,
  UpdateTripInput,
  UpdateActivityInput,
} from "@turprep/models"
import type { AuthService } from "./auth.js"
import { createApp } from "./app.js"
import { createGooglePlacesResolver, type GooglePlacesResolver } from "./google-places.js"
import { CurrencyRemovalError, type TripRepository } from "./trip-repository.js"

const testTrip: Trip = {
  id: "trip-1",
  name: "Testreise",
  startDate: "2026-08-10",
  endDate: "2026-08-12",
  notes: null,
}

const testTripDetail: TripDetail = {
  ...testTrip,
  acceptedCurrencies: [],
  days: [
    { date: "2026-08-10", dayNumber: 1, title: null, notes: null, activities: [] },
    { date: "2026-08-11", dayNumber: 2, title: null, notes: null, activities: [] },
    { date: "2026-08-12", dayNumber: 3, title: null, notes: null, activities: [] },
  ],
  backupActivities: [],
  housingStays: [],
  meals: [],
  preferences: [],
  itemDetailVisibility: { showPrice: true, showWebsite: true },
}

const testActivity: Activity = {
  id: "activity-1",
  tripId: "trip-1",
  tripDate: "2026-08-11",
  isBackup: false,
  title: "Besøke museet",
  startTime: "10:00",
  endTime: "12:00",
  allDay: false,
  notes: null,
  googleMapsUrl: null,
  placeName: null,
  placeAddress: null,
  latitude: null,
  longitude: null,
  priceAmount: null,
  priceCurrency: null,
  website: null,
  sortOrder: 0,
}

const testHousingStay: HousingStay = {
  id: "housing-1",
  tripId: "trip-1",
  name: "Hotell",
  checkIn: "2026-08-10",
  checkOut: "2026-08-11",
  isBackup: false,
  notes: null,
  googleMapsUrl: null,
  placeName: null,
  placeAddress: null,
  latitude: null,
  longitude: null,
  priceAmount: null,
  priceCurrency: null,
  website: null,
}

const laterTestActivity: Activity = {
  ...testActivity,
  id: "activity-2",
  title: "Middag",
  startTime: "18:00",
  endTime: "20:00",
  sortOrder: 1,
}

const allDayTestActivity: Activity = {
  ...testActivity,
  id: "activity-all-day",
  title: "Byvandring",
  startTime: "23:00",
  endTime: "23:30",
  allDay: true,
  sortOrder: 1,
}

const timedTripDetail: TripDetail = {
  ...testTripDetail,
  days: testTripDetail.days.map((day) =>
    day.date === "2026-08-11" ? { ...day, activities: [testActivity, laterTestActivity] } : day,
  ),
}

const allDayTripDetail: TripDetail = {
  ...testTripDetail,
  days: testTripDetail.days.map((day) =>
    day.date === "2026-08-11"
      ? {
          ...day,
          activities: [testActivity, allDayTestActivity, laterTestActivity],
        }
      : day,
  ),
}

function createTestApp(
  googlePlacesResolver?: GooglePlacesResolver,
  tripDetail = testTripDetail,
  repositoryOverrides: Partial<TripRepository> = {},
) {
  const authService: AuthService = {
    authenticate: async (accessToken) =>
      accessToken === "valid-token"
        ? { id: "user-1", name: "Test User", email: "user@example.com" }
        : null,
  }
  const tripRepository: TripRepository = {
    listTrips: async () => [testTrip],
    getTrip: async () => tripDetail,
    createTrip: async (_userId, _accessToken, input: CreateTripInput) => ({
      id: "trip-2",
      ...input,
    }),
    updateTrip: async (_userId, _accessToken, _tripId, input: UpdateTripInput) => ({
      ...testTripDetail,
      ...input,
    }),
    deleteTrip: async () => true,
    updateDay: async (_userId, _accessToken, _tripId, tripDate, input) => ({
      date: tripDate,
      dayNumber: 1,
      title: input.title ?? null,
      notes: input.notes ?? null,
      activities: [],
    }),
    getHousingStay: async () => null,
    createHousingStay: async (
      _userId,
      _accessToken,
      tripId,
      input: CreateHousingStayInput,
    ): Promise<HousingStay> => ({
      id: "housing-1",
      tripId,
      ...input,
    }),
    updateHousingStay: async () => null,
    deleteHousingStay: async () => true,
    getMeal: async () => null,
    createMeal: async (_userId, _accessToken, tripId, input: CreateMealInput): Promise<Meal> => ({
      id: "meal-1",
      tripId,
      ...input,
      googleMapsUrl: input.googleMapsUrl ?? null,
      placeName: input.placeName ?? null,
      placeAddress: input.placeAddress ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      priceAmount: input.priceAmount ?? null,
      priceCurrency: input.priceCurrency ?? null,
      website: input.website ?? null,
      sortOrder: 0,
    }),
    updateMeal: async () => null,
    deleteMeal: async () => true,
    getActivity: async () => testActivity,
    createActivity: async (_userId, _accessToken, tripId, input: CreateActivityInput) => ({
      id: "activity-2",
      tripId,
      ...input,
      sortOrder: 0,
    }),
    updateActivity: async (
      _userId,
      _accessToken,
      _tripId,
      _activityId,
      input: UpdateActivityInput,
    ) => ({
      ...testActivity,
      ...input,
    }),
    reorderActivities: async (_userId, _accessToken, _tripId, input) =>
      input.activities.map((activity) => ({
        ...testActivity,
        id: activity.activityId,
        tripDate: activity.tripDate,
        sortOrder: activity.sortOrder,
      })),
    reorderDayItems: async (_userId, _accessToken, _tripId, input) => ({
      activities: input.items
        .filter((item) => item.itemType === "activity")
        .map((item) => ({
          ...testActivity,
          id: item.itemId,
          tripDate: item.tripDate,
          isBackup: false,
          sortOrder: item.sortOrder,
        })),
      meals: input.items
        .filter((item) => item.itemType === "meal")
        .map((item) => ({
          id: item.itemId,
          tripId: "trip-1",
          tripDate: item.tripDate,
          isBackup: false,
          title: "Test meal",
          startTime: null,
          endTime: null,
          allDay: true,
          notes: null,
          googleMapsUrl: null,
          placeName: null,
          placeAddress: null,
          latitude: null,
          longitude: null,
          priceAmount: null,
          priceCurrency: null,
          website: null,
          sortOrder: item.sortOrder,
        })),
    }),
    getTripSharing: async () => null,
    getTripOwnerEmail: async () => null,
    getTripAccessStatus: async () => ({ status: "none", isNew: false }),
    createTripInvitation: async () => null,
    createTripAccessLink: async () => null,
    requestTripAccess: async () => null,
    approveTripAccessRequest: async () => null,
    denyTripAccessRequest: async () => null,
    revokeTripInvitation: async () => null,
    revokeTripAccessLink: async () => null,
    removeTripMember: async () => null,
    deleteActivity: async () => true,
    setTripItemPreference: async () => null,
    getTripCurrencies: async () => ({ tripId: "trip-1", acceptedCurrencies: [] }),
    updateTripCurrencies: async (_userId, _accessToken, tripId, input) => ({
      tripId,
      acceptedCurrencies: input.acceptedCurrencies,
    }),
    getTripItemDetailVisibility: async () => ({ showPrice: true, showWebsite: true }),
    updateTripItemDetailVisibility: async (_userId, _accessToken, _tripId, input) => input,
  }

  return createApp({
    authService,
    tripRepository: { ...tripRepository, ...repositoryOverrides },
    googlePlacesResolver,
  })
}

test("health endpoint is public", async () => {
  const response = await request(createTestApp()).get("/api/health")

  assert.equal(response.status, 200)
  assert.equal(response.body.status, "ok")
})

test("trip list requires authentication", async () => {
  const response = await request(createTestApp()).get("/api/trips")

  assert.equal(response.status, 401)
  assert.equal(response.body.message, "Authentication required")
})

test("preference updates require authentication", async () => {
  const response = await request(createTestApp())
    .put("/api/trips/trip-1/preferences")
    .send({ itemType: "activity", itemId: "activity-1", value: "green" })

  assert.equal(response.status, 401)
})

test("authenticated users can create, update, and remove item preferences", async () => {
  let preference: TripItemPreference | null = null
  const app = createTestApp(undefined, testTripDetail, {
    setTripItemPreference: async (userId, _accessToken, tripId, input) => {
      if (input.value === null) {
        preference = null
        return null
      }

      preference = {
        id: preference?.id ?? "preference-1",
        tripId,
        userId,
        itemType: input.itemType,
        itemId: input.itemId,
        value: input.value,
        updatedAt: "2026-08-10T12:00:00.000Z",
      }
      return preference
    },
  })

  const createResponse = await request(app)
    .put("/api/trips/trip-1/preferences")
    .set("Authorization", "Bearer valid-token")
    .send({ itemType: "activity", itemId: "activity-1", value: "green" })

  assert.equal(createResponse.status, 200)
  assert.equal(createResponse.body.value, "green")

  const updateResponse = await request(app)
    .put("/api/trips/trip-1/preferences")
    .set("Authorization", "Bearer valid-token")
    .send({ itemType: "activity", itemId: "activity-1", value: "red" })

  assert.equal(updateResponse.status, 200)
  assert.equal(updateResponse.body.value, "red")

  const removeResponse = await request(app)
    .put("/api/trips/trip-1/preferences")
    .set("Authorization", "Bearer valid-token")
    .send({ itemType: "activity", itemId: "activity-1", value: null })

  assert.equal(removeResponse.status, 200)
  assert.equal(removeResponse.body, null)
})

test("preference updates reject invalid item types", async () => {
  const response = await request(createTestApp())
    .put("/api/trips/trip-1/preferences")
    .set("Authorization", "Bearer valid-token")
    .send({ itemType: "invalid", itemId: "activity-1", value: "green" })

  assert.equal(response.status, 400)
})

test("preference updates return not found for items outside the trip", async () => {
  const app = createTestApp(undefined, testTripDetail, {
    setTripItemPreference: async () => null,
  })
  const response = await request(app)
    .put("/api/trips/trip-1/preferences")
    .set("Authorization", "Bearer valid-token")
    .send({ itemType: "meal", itemId: "meal-from-another-trip", value: "yellow" })

  assert.equal(response.status, 404)
})

test("currency settings require authentication", async () => {
  const response = await request(createTestApp()).get("/api/trips/trip-1/currencies")

  assert.equal(response.status, 401)
})

test("authenticated users can update shared trip currencies", async () => {
  const response = await request(createTestApp())
    .put("/api/trips/trip-1/currencies")
    .set("Authorization", "Bearer valid-token")
    .send({ acceptedCurrencies: ["nok", "EUR"] })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    tripId: "trip-1",
    acceptedCurrencies: ["NOK", "EUR"],
  })
})

test("currency settings reject removing currencies used by trip items", async () => {
  const app = createTestApp(undefined, testTripDetail, {
    updateTripCurrencies: async () => {
      throw new CurrencyRemovalError(["NOK"])
    },
  })
  const response = await request(app)
    .put("/api/trips/trip-1/currencies")
    .set("Authorization", "Bearer valid-token")
    .send({ acceptedCurrencies: ["EUR"] })

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, {
    message:
      "Cannot remove currencies currently used by trip items: NOK. " +
      "Update the item prices before removing these currencies.",
    currencies: ["NOK"],
  })
})

test("item detail visibility requires authentication", async () => {
  const response = await request(createTestApp()).put("/api/trips/trip-1/item-detail-visibility")

  assert.equal(response.status, 401)
})

test("authenticated users can update item detail visibility", async () => {
  const response = await request(createTestApp())
    .put("/api/trips/trip-1/item-detail-visibility")
    .set("Authorization", "Bearer valid-token")
    .send({ showPrice: false, showWebsite: true })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { showPrice: false, showWebsite: true })
})

test("item prices reject amounts with more than two decimals", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      title: "Museum",
      tripDate: "2026-08-11",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
      priceAmount: 10.123,
      priceCurrency: "NOK",
      website: "Valgfri tekst",
    })

  assert.equal(response.status, 400)
})

test("sharing endpoints require authentication", async () => {
  const response = await request(createTestApp()).get("/api/trips/trip-1/sharing")

  assert.equal(response.status, 401)
})

test("trip owners can create an access link", async () => {
  const accessLink: TripAccessLink = {
    id: "link-1",
    tripId: "trip-1",
    token: "link-token",
    revokedAt: null,
    createdAt: "2026-08-07T08:00:00.000Z",
  }
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      createTripAccessLink: async () => accessLink,
    }),
  )
    .post("/api/trips/trip-1/sharing/access-links")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 201)
  assert.deepEqual(response.body, accessLink)
})

test("accessible users can view trip sharing state", async () => {
  const sharing: TripSharing = {
    ownerId: "user-1",
    canManage: true,
    members: [],
    invitations: [],
    requests: [],
    accessLinks: [],
  }
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      getTripSharing: async () => sharing,
    }),
  )
    .get("/api/trips/trip-1/sharing")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, sharing)
})

test("authenticated users can view their trip access status", async () => {
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      getTripAccessStatus: async () => ({ status: "pending", isNew: false }),
    }),
  )
    .get("/api/trips/trip-1/sharing/access-status")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: "pending", isNew: false })
})

test("existing access requests are returned without sending a duplicate request", async () => {
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      requestTripAccess: async () => ({ status: "pending", isNew: false }),
    }),
  )
    .post("/api/trips/trip-1/sharing/access-requests")
    .set("Authorization", "Bearer valid-token")
    .send({ invitationId: "11111111-1111-4111-8111-111111111111" })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { status: "pending", isNew: false })
})

test("authenticated users can list trips", async () => {
  const response = await request(createTestApp())
    .get("/api/trips")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, [testTrip])
})

test("trip creation rejects an inverted date range", async () => {
  const response = await request(createTestApp())
    .post("/api/trips")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Ugyldig reise",
      startDate: "2026-08-12",
      endDate: "2026-08-10",
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /end date/i)
})

test("authenticated users can create trips", async () => {
  const response = await request(createTestApp())
    .post("/api/trips")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Ny testreise",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    })

  assert.equal(response.status, 201)
  assert.deepEqual(response.body, {
    id: "trip-2",
    name: "Ny testreise",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    notes: null,
  })
})

test("trip creation rejects trips longer than 60 days", async () => {
  const response = await request(createTestApp())
    .post("/api/trips")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "For lang testreise",
      startDate: "2026-01-01",
      endDate: "2026-03-02",
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /60 days/i)
})

test("trip creation allows a 60-day trip", async () => {
  const response = await request(createTestApp())
    .post("/api/trips")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Seksti dagers testreise",
      startDate: "2026-01-01",
      endDate: "2026-03-01",
    })

  assert.equal(response.status, 201)
})

test("authenticated users can archive a trip", async () => {
  const response = await request(createTestApp())
    .delete("/api/trips/trip-1")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 204)
})

test("authenticated users can update trip settings", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Oppdatert testreise",
      startDate: "2026-08-09",
      endDate: "2026-08-13",
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.name, "Oppdatert testreise")
  assert.equal(response.body.startDate, "2026-08-09")
})

test("authenticated users can update a trip note", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1")
    .set("Authorization", "Bearer valid-token")
    .send({ notes: "Bestill tog på forhånd" })

  assert.equal(response.status, 200)
  assert.equal(response.body.notes, "Bestill tog på forhånd")
})

test("authenticated users can update a day note", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/days/2026-08-11")
    .set("Authorization", "Bearer valid-token")
    .send({ notes: "Start tidlig" })

  assert.equal(response.status, 200)
  assert.equal(response.body.date, "2026-08-11")
  assert.equal(response.body.notes, "Start tidlig")
})

test("authenticated users can update a day title", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/days/2026-08-11")
    .set("Authorization", "Bearer valid-token")
    .send({ title: "Ankomst til Oslo" })

  assert.equal(response.status, 200)
  assert.equal(response.body.date, "2026-08-11")
  assert.equal(response.body.title, "Ankomst til Oslo")
})

test("authenticated users can create a housing stay with a note", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/housing")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Hotell",
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
      notes: "Be om rom høyt oppe",
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.notes, "Be om rom høyt oppe")
})

test("housing creation resolves a Google Maps link", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Hotel Bristol",
      address: "Kristian IVs gate 7, Oslo",
      latitude: 59.915,
      longitude: 10.738,
    })),
  )
    .post("/api/trips/trip-1/housing")
    .set("Authorization", "Bearer valid-token")
    .send({
      name: "Hotel Bristol",
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
      notes: null,
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.googleMapsUrl, "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6")
  assert.equal(response.body.placeName, "Hotel Bristol")
  assert.equal(response.body.placeAddress, "Kristian IVs gate 7, Oslo")
  assert.equal(response.body.latitude, 59.915)
  assert.equal(response.body.longitude, 10.738)
})

test("housing updates resolve a Google Maps link", async () => {
  const response = await request(
    createTestApp(
      async () => ({
        name: "Hotel Bristol",
        address: "Kristian IVs gate 7, Oslo",
        latitude: 59.915,
        longitude: 10.738,
      }),
      testTripDetail,
      {
        getHousingStay: async () => testHousingStay,
        updateHousingStay: async (_userId, _accessToken, _tripId, _housingStayId, input) => ({
          ...testHousingStay,
          ...input,
        }),
      },
    ),
  )
    .patch("/api/trips/trip-1/housing/housing-1")
    .set("Authorization", "Bearer valid-token")
    .send({ googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6" })

  assert.equal(response.status, 200)
  assert.equal(response.body.googleMapsUrl, "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6")
  assert.equal(response.body.placeName, "Hotel Bristol")
  assert.equal(response.body.latitude, 59.915)
  assert.equal(response.body.longitude, 10.738)
})

test("housing updates clear place fields when a Google Maps link is removed", async () => {
  const linkedHousingStay: HousingStay = {
    ...testHousingStay,
    googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    placeName: "Hotel Bristol",
    placeAddress: "Kristian IVs gate 7, Oslo",
    latitude: 59.915,
    longitude: 10.738,
  }
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      getHousingStay: async () => linkedHousingStay,
      updateHousingStay: async (_userId, _accessToken, _tripId, _housingStayId, input) => ({
        ...linkedHousingStay,
        ...input,
      }),
    }),
  )
    .patch("/api/trips/trip-1/housing/housing-1")
    .set("Authorization", "Bearer valid-token")
    .send({ googleMapsUrl: null })

  assert.equal(response.status, 200)
  assert.equal(response.body.googleMapsUrl, null)
  assert.equal(response.body.placeName, null)
  assert.equal(response.body.placeAddress, null)
  assert.equal(response.body.latitude, null)
  assert.equal(response.body.longitude, null)
})

test("authenticated users can create a meal with a note", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/meals")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: "Middag",
      startTime: "18:00",
      endTime: "20:00",
      allDay: false,
      notes: "Bestill bord",
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.notes, "Bestill bord")
})

test("meal creation resolves a Google Maps link", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Mathallen",
      address: "Vulkan 5, Oslo",
      latitude: 59.922,
      longitude: 10.752,
    })),
  )
    .post("/api/trips/trip-1/meals")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: null,
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.title, null)
  assert.equal(response.body.placeName, "Mathallen")
  assert.equal(response.body.placeAddress, "Vulkan 5, Oslo")
  assert.equal(response.body.latitude, 59.922)
  assert.equal(response.body.longitude, 10.752)
})

test("meal creation keeps a custom title when resolving a Google Maps link", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Mathallen",
      address: "Vulkan 5, Oslo",
      latitude: 59.922,
      longitude: 10.752,
    })),
  )
    .post("/api/trips/trip-1/meals")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: "Dinner at Mathallen",
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.title, "Dinner at Mathallen")
  assert.equal(response.body.placeName, "Mathallen")
})

test("meal updates clear place coordinates when a Google Maps link is removed", async () => {
  const linkedMeal: Meal = {
    id: "meal-1",
    tripId: "trip-1",
    tripDate: "2026-08-11",
    isBackup: false,
    title: "Middag",
    startTime: null,
    endTime: null,
    allDay: true,
    notes: null,
    googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    placeName: "Mathallen",
    placeAddress: "Vulkan 5, Oslo",
    latitude: 59.922,
    longitude: 10.752,
    priceAmount: null,
    priceCurrency: null,
    website: null,
    sortOrder: 0,
  }
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      getMeal: async () => linkedMeal,
      updateMeal: async (_userId, _accessToken, _tripId, _mealId, input) => ({
        ...linkedMeal,
        ...input,
      }),
    }),
  )
    .patch("/api/trips/trip-1/meals/meal-1")
    .set("Authorization", "Bearer valid-token")
    .send({ title: "Middag", googleMapsUrl: null })

  assert.equal(response.status, 200)
  assert.equal(response.body.googleMapsUrl, null)
  assert.equal(response.body.latitude, null)
  assert.equal(response.body.longitude, null)
})

test("full Google Maps place links are accepted", () => {
  const url =
    "https://www.google.com/maps/place/Oslo+Camping/@59.9144959,10.7426482,782m/data=!3m2!1e3!4b1!4m6!3m5!1s0x46416e625634a04b:0xdbce3291121aff6e!8m2!3d59.9144933!4d10.7475191!16s%2Fg%2F11c1q7nvxj?entry=ttu&g_ep=EgoyMDI2MDgwMy4wIKXMDSoASAFQAw%3D%3D"

  assert.equal(isAllowedGoogleMapsUrl(url), true)
  assert.equal(isAllowedGoogleMapsUrl(`  ${url}\n`), true)
})

test("Google Places resolves a full place URL without redirect resolution", async () => {
  const url =
    "https://www.google.com/maps/place/Oslo+Camping/@59.9144959,10.7426482,782m/data=!3m2!1e3!4b1!4m6!3m5!1s0x46416e625634a04b:0xdbce3291121aff6e!8m2!3d59.9144933!4d10.7475191!16s%2Fg%2F11c1q7nvxj?entry=ttu&g_ep=EgoyMDI2MDgwMy4wIKXMDSoASAFQAw%3D%3D"
  const originalFetch = globalThis.fetch
  const requests: string[] = []

  globalThis.fetch = async (input) => {
    requests.push(String(input))
    return new Response(
      JSON.stringify({
        places: [
          {
            displayName: { text: "Oslo Camping" },
            formattedAddress: "Ekebergveien 65, Oslo",
            location: { latitude: 59.9144933, longitude: 10.7475191 },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  try {
    const place = await createGooglePlacesResolver("test-key")(url)

    assert.deepEqual(place, {
      name: "Oslo Camping",
      address: "Ekebergveien 65, Oslo",
      latitude: 59.9144933,
      longitude: 10.7475191,
    })
    assert.deepEqual(requests, ["https://places.googleapis.com/v1/places:searchText"])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Google Places uses full place URL coordinates when text search has no result", async () => {
  const url =
    "https://www.google.com/maps/place/Kazuya+Rice+Flour+Bread+Cafe/@35.6972086,139.8003857,917m/data=!3m1!1e3!4m15!1m8!2m7!1sRestaurants!3m5!2sArkaden!3s0x46416e89dd75c50d:0x9b553acd95992fe2!4m2!1d10.7484049!2d59.9116603!3m5!1s0x60188933108a6a9b:0x36547a12db1c595d!8m2!3d35.6981009!4d139.8002201!16s%2Fg%2F11d_wyb6rt?entry=ttu&g_ep=EgoyMDI2MDgwNS4xIKXMDSoASAFQAw%3D%3D"
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })

  try {
    const place = await createGooglePlacesResolver("test-key")(url)

    assert.deepEqual(place, {
      name: "Kazuya Rice Flour Bread Cafe",
      address: "Kazuya Rice Flour Bread Cafe",
      latitude: 35.6981009,
      longitude: 139.8002201,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("trip updates reject trips longer than 60 days", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      startDate: "2026-01-01",
      endDate: "2026-03-02",
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /60 days/i)
})

test("trip details include every date in the inclusive range", async () => {
  const response = await request(createTestApp())
    .get("/api/trips/trip-1")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 200)
  assert.equal(response.body.days.length, 3)
  assert.equal(response.body.days[0].date, "2026-08-10")
  assert.equal(response.body.days[2].date, "2026-08-12")
  assert.deepEqual(response.body.itemDetailVisibility, { showPrice: true, showWebsite: true })
})

test("authenticated users can create an activity within a trip", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: "Ny aktivitet",
      startTime: "14:00",
      endTime: "15:30",
      allDay: false,
      notes: null,
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.title, "Ny aktivitet")
  assert.equal(response.body.tripDate, "2026-08-11")
})

test("authenticated users can create an activity in the backup area without a date", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: null,
      isBackup: true,
      title: "Alternativ aktivitet",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.isBackup, true)
  assert.equal(response.body.tripDate, null)
})

test("backup activity can be moved into the plan", async () => {
  const backupActivity: Activity = {
    ...testActivity,
    tripDate: null,
    isBackup: true,
  }
  const response = await request(
    createTestApp(
      undefined,
      {
        ...testTripDetail,
        backupActivities: [backupActivity],
        days: testTripDetail.days.map((day) =>
          day.date === "2026-08-11" ? { ...day, activities: [] } : day,
        ),
      },
      {
        updateActivity: async (_userId, _accessToken, _tripId, _activityId, input) => ({
          ...backupActivity,
          ...input,
        }),
        getActivity: async () => backupActivity,
      },
    ),
  )
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({ isBackup: false, tripDate: "2026-08-11" })

  assert.equal(response.status, 200)
  assert.equal(response.body.isBackup, false)
  assert.equal(response.body.tripDate, "2026-08-11")
})

test("activity creation resolves a Google Maps link", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Colosseum",
      address: "Piazza del Colosseo, 1, Rome",
      latitude: 41.8902,
      longitude: 12.4922,
    })),
  )
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: "Colosseum entrance",
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 201)
  assert.equal(response.body.title, "Colosseum entrance")
  assert.equal(response.body.placeName, "Colosseum")
  assert.equal(response.body.placeAddress, "Piazza del Colosseo, 1, Rome")
  assert.equal(response.body.latitude, 41.8902)
  assert.equal(response.body.longitude, 12.4922)
})

test("activity updates resolve a Google Maps link", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Colosseum",
      address: "Piazza del Colosseo, 1, Rome",
      latitude: 41.8902,
      longitude: 12.4922,
    })),
  )
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.title, "Besøke museet")
  assert.equal(response.body.placeName, "Colosseum")
  assert.equal(response.body.latitude, 41.8902)
  assert.equal(response.body.longitude, 12.4922)
})

test("activity updates clear place coordinates when a Google Maps link is removed", async () => {
  const linkedActivity: Activity = {
    ...testActivity,
    googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    placeName: "Colosseum",
    placeAddress: "Piazza del Colosseo, 1, Rome",
    latitude: 41.8902,
    longitude: 12.4922,
  }
  const response = await request(
    createTestApp(undefined, testTripDetail, {
      getActivity: async () => linkedActivity,
      updateActivity: async (_userId, _accessToken, _tripId, _activityId, input) => ({
        ...linkedActivity,
        ...input,
      }),
    }),
  )
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({ title: "Besøke museet", googleMapsUrl: null })

  assert.equal(response.status, 200)
  assert.equal(response.body.googleMapsUrl, null)
  assert.equal(response.body.latitude, null)
  assert.equal(response.body.longitude, null)
})

test("activity updates preserve a custom title when a Google Maps link is added", async () => {
  const response = await request(
    createTestApp(async () => ({
      name: "Colosseum",
      address: "Piazza del Colosseo, 1, Rome",
      latitude: 41.8902,
      longitude: 12.4922,
    })),
  )
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      title: "Visit the Colosseum",
      googleMapsUrl: "https://maps.app.goo.gl/UqkAP8Bc5mx1tcVq6",
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.title, "Visit the Colosseum")
  assert.equal(response.body.placeName, "Colosseum")
})

test("activity creation requires a title or Google Maps link", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-11",
      title: null,
      googleMapsUrl: null,
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 400)
})

test("activity updates cannot clear the only title without a Google Maps link", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      title: null,
      googleMapsUrl: null,
    })

  assert.equal(response.status, 400)
})

test("activity creation rejects dates outside the trip", async () => {
  const response = await request(createTestApp())
    .post("/api/trips/trip-1/activities")
    .set("Authorization", "Bearer valid-token")
    .send({
      tripDate: "2026-08-13",
      title: "Ugyldig aktivitet",
      startTime: null,
      endTime: null,
      allDay: true,
      notes: null,
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /within the trip/i)
})

test("authenticated users can update an activity", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")
    .send({
      title: "Oppdatert aktivitet",
      notes: "Husk billetter",
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.title, "Oppdatert aktivitet")
  assert.equal(response.body.notes, "Husk billetter")
})

test("authenticated users can reorder activities in one request", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/activities/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      activities: [
        {
          activityId: "activity-1",
          tripDate: "2026-08-12",
          sortOrder: 0,
        },
      ],
    })

  assert.equal(response.status, 200)
  assert.equal(response.body[0].id, "activity-1")
  assert.equal(response.body[0].tripDate, "2026-08-12")
  assert.equal(response.body[0].sortOrder, 0)
})

test("authenticated users can reorder activities and meals together", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "activity",
          itemId: "activity-1",
          tripDate: "2026-08-12",
          sortOrder: 1,
        },
        {
          itemType: "meal",
          itemId: "meal-1",
          tripDate: "2026-08-12",
          sortOrder: 0,
        },
      ],
    })

  assert.equal(response.status, 200)
  assert.equal(response.body.activities[0].id, "activity-1")
  assert.equal(response.body.activities[0].tripDate, "2026-08-12")
  assert.equal(response.body.meals[0].id, "meal-1")
  assert.equal(response.body.meals[0].sortOrder, 0)
})

test("day item reorder rejects timed items in reverse order", async () => {
  const response = await request(createTestApp(undefined, timedTripDetail))
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "activity",
          itemId: "activity-2",
          tripDate: "2026-08-11",
          sortOrder: 0,
        },
        {
          itemType: "activity",
          itemId: "activity-1",
          tripDate: "2026-08-11",
          sortOrder: 1,
        },
      ],
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /ordered by start time/i)
})

test("day item reorder accepts swapped timed slots", async () => {
  const response = await request(createTestApp(undefined, timedTripDetail))
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "activity",
          itemId: "activity-2",
          tripDate: "2026-08-11",
          sortOrder: 0,
          startTime: "10:00",
          endTime: "12:00",
        },
        {
          itemType: "activity",
          itemId: "activity-1",
          tripDate: "2026-08-11",
          sortOrder: 1,
          startTime: "18:00",
          endTime: "20:00",
        },
      ],
    })

  assert.equal(response.status, 200)
})

test("day item reorder ignores all-day items when validating timed order", async () => {
  const response = await request(createTestApp(undefined, allDayTripDetail))
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "activity",
          itemId: "activity-all-day",
          tripDate: "2026-08-11",
          sortOrder: 0,
        },
        {
          itemType: "activity",
          itemId: "activity-1",
          tripDate: "2026-08-11",
          sortOrder: 1,
        },
        {
          itemType: "activity",
          itemId: "activity-2",
          tripDate: "2026-08-11",
          sortOrder: 2,
        },
      ],
    })

  assert.equal(response.status, 200)
})

test("day item reorder rejects duplicate item keys", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "meal",
          itemId: "meal-1",
          tripDate: "2026-08-11",
          sortOrder: 0,
        },
        {
          itemType: "meal",
          itemId: "meal-1",
          tripDate: "2026-08-11",
          sortOrder: 1,
        },
      ],
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /unique/i)
})

test("day item reorder rejects dates outside the trip", async () => {
  const response = await request(createTestApp())
    .patch("/api/trips/trip-1/day-items/reorder")
    .set("Authorization", "Bearer valid-token")
    .send({
      items: [
        {
          itemType: "meal",
          itemId: "meal-1",
          tripDate: "2026-08-13",
          sortOrder: 0,
        },
      ],
    })

  assert.equal(response.status, 400)
  assert.match(response.body.message, /within the trip/i)
})

test("authenticated users can delete an activity", async () => {
  const response = await request(createTestApp())
    .delete("/api/trips/trip-1/activities/activity-1")
    .set("Authorization", "Bearer valid-token")

  assert.equal(response.status, 204)
})
