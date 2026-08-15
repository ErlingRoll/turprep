export const PRODUCT_NAME = "Turprep"
export const PRODUCT_DOMAIN = "turprep.com"

export const storageKeys = {
  language: "turprep-language",
  legacyLanguage: "planleggreise-language",
  theme: "turprep-theme",
  legacyTheme: "planleggreise-theme",
  showItemDetails: "turprep-show-item-details",
  rememberSession: "turprep.remember-session",
  legacyRememberSession: "planleggreise.remember-session",
  selectedDaysPrefix: "turprep-selected-days-",
  legacySelectedDaysPrefix: "planleggreise-selected-days-",
  httpErrorEvent: "turprep:http-error",
} as const

export function readMigratedStorageValue(key: string, legacyKey: string) {
  const currentValue = window.localStorage.getItem(key)

  if (currentValue !== null) {
    return currentValue
  }

  const legacyValue = window.localStorage.getItem(legacyKey)

  if (legacyValue !== null) {
    window.localStorage.setItem(key, legacyValue)
  }

  return legacyValue
}
