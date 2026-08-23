import assert from "node:assert/strict"
import test from "node:test"
import { createGooglePlacesResolver } from "./google-places.js"

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
