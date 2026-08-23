import assert from "node:assert/strict"
import test from "node:test"
import { getSuggestionRegion, SUGGESTION_QUESTION_CATALOG } from "@turprep/models"
import {
  buildSuggestionQueries,
  createGooglePlacesResolver,
  createGooglePlacesSuggestionsResolver,
} from "./google-places.js"

const teamLabBorderlessUrl =
  "https://www.google.com/maps/place/teamLab+Borderless:+MORI+Building+DIGITAL+ART+MUSEUM/@35.6619429,139.7535809,5261m/data=!3m2!1e3!5s0x60188b9741cfc0d3:0xc91c5c5975739ded!4m24!1m12!3m11!1s0x601889fad49a9443:0x5831aba3288d2651!2steamLab+Borderless:+MORI+Building+DIGITAL+ART+MUSEUM!5m4!1s2026-12-19!2i3!4m1!1i4!8m2!3d35.6620689!4d139.7432671!16s%2Fg%2F11ggvtjmjl!3m10!1s0x601889fad49a9443:0x5831aba3288d2651!5m4!1s2026-12-19!2i3!4m1!1i4!8m2!3d35.6620689!4d139.7432671!16s%2Fg%2F11ggvtjmjl?entry=ttu&g_ep=EgoyMDI2MDgxNy4wIKXMDSoASAFQAw%3D%3D"

test("Google Maps place URLs fall back to embedded coordinates when Places returns no result", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ places: [] }), { status: 200 })

  try {
    const place = await createGooglePlacesResolver("test-key")(teamLabBorderlessUrl)

    assert.equal(place.name, "teamLab Borderless: MORI Building DIGITAL ART MUSEUM")
    assert.equal(place.latitude, 35.6620689)
    assert.equal(place.longitude, 139.7432671)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Google Maps place URLs fall back when the Places response cannot be parsed", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response("<html>temporarily unavailable</html>", { status: 200 })

  try {
    const place = await createGooglePlacesResolver("test-key")(teamLabBorderlessUrl)

    assert.equal(place.latitude, 35.6620689)
    assert.equal(place.longitude, 139.7432671)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Google Maps place URLs load rich fields from the Place Details endpoint", async () => {
  const originalFetch = globalThis.fetch
  const requests: Request[] = []
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init))

    if (requests.length === 1) {
      return new Response(JSON.stringify({ places: [{ id: "ChIJexample" }] }), { status: 200 })
    }

    return new Response(
      JSON.stringify({
        id: "ChIJexample",
        displayName: { text: "teamLab Borderless" },
        formattedAddress: "1-3-28 Aomi, Koto City, Tokyo",
        primaryTypeDisplayName: { text: "Museum" },
        nationalPhoneNumber: "+81 3-6368-4292",
        rating: 4.7,
        userRatingCount: 12000,
        regularOpeningHours: {
          openNow: true,
          weekdayDescriptions: ["Monday: 10:00 AM – 9:00 PM"],
        },
        photos: [
          {
            name: "places/ChIJexample/photos/photo1",
            widthPx: 1200,
            heightPx: 800,
          },
        ],
        location: {
          latitude: 35.6620689,
          longitude: 139.7432671,
        },
      }),
      { status: 200 },
    )
  }

  try {
    const place = await createGooglePlacesResolver("test-key")(teamLabBorderlessUrl)

    assert.equal(requests.length, 2)
    assert.equal(requests[0].method, "POST")
    assert.equal(requests[1].url, "https://places.googleapis.com/v1/places/ChIJexample")
    assert.equal(place.category, "Museum")
    assert.equal(place.phoneNumber, "+81 3-6368-4292")
    assert.equal(place.rating, 4.7)
    assert.equal(place.photos?.[0]?.name, "places/ChIJexample/photos/photo1")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("Google Maps place-id URLs load details without a text search", async () => {
  const originalFetch = globalThis.fetch
  const requests: Request[] = []
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init))
    return new Response(
      JSON.stringify({
        id: "ChIJexample",
        displayName: { text: "Suggested place" },
        formattedAddress: "Oslo, Norway",
        location: { latitude: 59.9139, longitude: 10.7522 },
      }),
      { status: 200 },
    )
  }

  try {
    const place = await createGooglePlacesResolver("test-key")(
      "https://www.google.com/maps/place/?q=place_id:ChIJexample",
    )

    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, "https://places.googleapis.com/v1/places/ChIJexample")
    assert.equal(place.name, "Suggested place")
  } finally {
    globalThis.fetch = originalFetch
  }
})

// ─── buildSuggestionQueries ───────────────────────────────────────────────────

test("buildSuggestionQueries returns base query when no answers provided", () => {
  const queries = buildSuggestionQueries("activity", [])
  assert.equal(queries.length, 1)
  assert.ok(queries[0].includes("attraction"))
})

test("buildSuggestionQueries includes a broad query and one query per answer", () => {
  const queries = buildSuggestionQueries("meal", [
    { questionId: "meal-occasion", optionId: "dinner" },
    { questionId: "meal-style", optionId: "vegetarian" },
  ], "winter")
  assert.equal(queries.length, 3)
  assert.ok(queries[0].includes("winter"))
  assert.ok(queries[1].includes("winter"))
  assert.ok(queries[1].includes("dinner"))
  assert.ok(queries[2].includes("winter"))
  assert.ok(queries[2].includes("vegetarian"))
})

test("buildSuggestionQueries supports surprise and similar discovery modes", () => {
  const surpriseQueries = buildSuggestionQueries("activity", [], "any", "surprise")
  const similarQueries = buildSuggestionQueries("meal", [], "any", "similar", "sushi restaurant")

  assert.ok(surpriseQueries[0].includes("hidden gem"))
  assert.ok(similarQueries[0].includes("sushi restaurant"))
})

// ─── createGooglePlacesSuggestionsResolver ────────────────────────────────────

const osloCoords = { latitude: 59.9139, longitude: 10.7522 }

test("generated questions use answer choices that match their topics", () => {
  const weatherQuestion = SUGGESTION_QUESTION_CATALOG.find(
    (question) => question.id === "activity-weather-ifWeatherChanges",
  )

  assert.deepEqual(
    weatherQuestion?.options.map((option) => option.id),
    ["weather-indoor", "weather-outdoor", "weather-any"],
  )
})

test("suggestion question catalog has broad regional coverage without duplicate IDs", () => {
  const activityQuestions = SUGGESTION_QUESTION_CATALOG.filter((question) => question.itemType === "activity")
  const mealQuestions = SUGGESTION_QUESTION_CATALOG.filter((question) => question.itemType === "meal")

  assert.ok(activityQuestions.length >= 250)
  assert.ok(mealQuestions.length >= 250)
  assert.equal(new Set(SUGGESTION_QUESTION_CATALOG.map((question) => question.id)).size, SUGGESTION_QUESTION_CATALOG.length)
  assert.equal(getSuggestionRegion("NO"), "nordics")
  assert.equal(getSuggestionRegion("JP"), "asia")
  assert.equal(getSuggestionRegion("unknown"), "global")
})

function makeSuggestionPlace(overrides: Record<string, unknown> = {}) {
  return {
    id: "place-abc",
    displayName: { text: "Oslo Museum" },
    formattedAddress: "Oslo, Norway",
    location: { latitude: 59.914, longitude: 10.753 },
    primaryTypeDisplayName: { text: "Museum" },
    priceLevel: null,
    rating: 4.5,
    userRatingCount: 200,
    photos: [{ name: "places/place-abc/photos/photo1" }],
    ...overrides,
  }
}

test("suggestions resolver returns 4 to 10 places mapped to GooglePlaceSuggestion", async () => {
  const originalFetch = globalThis.fetch

  const places = Array.from({ length: 8 }, (_, i) =>
    makeSuggestionPlace({ id: `place-${i}`, displayName: { text: `Place ${i}` } }),
  )
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ places }), { status: 200 })

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const results = await resolver({
      ...osloCoords,
      itemType: "activity",
      answers: [{ questionId: "activity-kind", optionId: "culture" }],
      excludedPlaceIds: [],
    })

    assert.ok(results.length >= 4)
    assert.ok(results.length <= 10)
    assert.ok(results.every((r) => typeof r.placeId === "string"))
    assert.ok(results.every((r) => r.googleMapsUrl.includes("place_id")))
    assert.ok(results.every((r) => typeof r.distanceMeters === "number"))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver returns at most four photo references", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          makeSuggestionPlace({
            photos: [
              { name: "places/place-abc/photos/photo1" },
              { name: "places/place-abc/photos/photo2" },
              { name: "places/place-abc/photos/photo3" },
              { name: "places/place-abc/photos/photo4" },
              { name: "places/place-abc/photos/photo5" },
            ],
          }),
        ],
      }),
      { status: 200 },
    )

  try {
    const results = await createGooglePlacesSuggestionsResolver("test-key")({
      ...osloCoords,
      itemType: "activity",
      answers: [],
      excludedPlaceIds: [],
    })

    assert.deepEqual(results[0]?.photoNames, [
      "places/place-abc/photos/photo1",
      "places/place-abc/photos/photo2",
      "places/place-abc/photos/photo3",
      "places/place-abc/photos/photo4",
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver caches repeated query results", async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    return new Response(JSON.stringify({ places: [makeSuggestionPlace()] }), { status: 200 })
  }

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const input = { ...osloCoords, itemType: "activity" as const, answers: [], excludedPlaceIds: [] }

    await resolver(input)
    await resolver(input)

    assert.equal(callCount, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver deduplicates places that appear in multiple query results", async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0

  // Return the same place for both queries
  globalThis.fetch = async () => {
    callCount++
    return new Response(
      JSON.stringify({ places: [makeSuggestionPlace({ id: "dup-place" })] }),
      { status: 200 },
    )
  }

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const results = await resolver({
      ...osloCoords,
      itemType: "activity",
      answers: [
        { questionId: "activity-kind", optionId: "culture" },
        { questionId: "activity-mood", optionId: "calm" },
      ],
      excludedPlaceIds: [],
    })

    assert.equal(callCount, 3)
    assert.equal(
      results.filter((r) => r.placeId === "dup-place").length,
      1,
      "duplicate place should appear only once",
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver excludes places in excludedPlaceIds", async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ places: [makeSuggestionPlace({ id: "excluded-place" })] }),
      { status: 200 },
    )

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const results = await resolver({
      ...osloCoords,
      itemType: "activity",
      answers: [],
      excludedPlaceIds: ["excluded-place"],
    })

    assert.equal(results.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver returns empty array when Places API fails", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response("", { status: 500 })

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const results = await resolver({
      ...osloCoords,
      itemType: "meal",
      answers: [],
      excludedPlaceIds: [],
    })

    assert.equal(results.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver uses locationBias with 10 km radius", async () => {
  const originalFetch = globalThis.fetch
  const bodies: unknown[] = []

  globalThis.fetch = async (input, init) => {
    if (init?.body) bodies.push(JSON.parse(init.body as string))
    return new Response(JSON.stringify({ places: [] }), { status: 200 })
  }

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    await resolver({ ...osloCoords, itemType: "activity", answers: [], excludedPlaceIds: [] })

    assert.equal(bodies.length, 1)
    const body = bodies[0] as { locationBias: { circle: { radius: number } } }
    assert.equal(body.locationBias.circle.radius, 10_000)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver filters places outside the 10 km radius", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          makeSuggestionPlace({ id: "near-place" }),
          makeSuggestionPlace({
            id: "far-place",
            location: { latitude: 60.5, longitude: 10.7522 },
          }),
        ],
      }),
      { status: 200 },
    )

  try {
    const resolver = createGooglePlacesSuggestionsResolver("test-key")
    const results = await resolver({ ...osloCoords, itemType: "activity", answers: [], excludedPlaceIds: [] })

    assert.deepEqual(
      results.map((result) => result.placeId),
      ["near-place"],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("suggestions resolver throws GooglePlacesError when API key is missing", async () => {
  const resolver = createGooglePlacesSuggestionsResolver(undefined)

  await assert.rejects(
    () => resolver({ ...osloCoords, itemType: "activity", answers: [], excludedPlaceIds: [] }),
    (error: unknown) => error instanceof Error && error.message.includes("not configured"),
  )
})
