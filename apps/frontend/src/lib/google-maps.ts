import { importLibrary, setOptions } from "@googlemaps/js-api-loader"

let configuredApiKey: string | null = null
let googleMapsLoadPromise: Promise<void> | null = null

export function loadGoogleMaps(apiKey: string) {
  if (configuredApiKey === null) {
    setOptions({
      key: apiKey,
      language: "en",
      v: "weekly",
    })
    configuredApiKey = apiKey
  }

  if (configuredApiKey !== apiKey) {
    return Promise.reject(new Error("Google Maps cannot be loaded with multiple API keys."))
  }

  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(() => undefined)
      .catch((error: unknown) => {
        googleMapsLoadPromise = null
        throw error
      })
  }

  return googleMapsLoadPromise
}
