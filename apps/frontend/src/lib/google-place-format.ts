export function formatGooglePriceLevel(priceLevel: string, translate: (key: string) => string) {
  const level = {
    PRICE_LEVEL_FREE: "low",
    PRICE_LEVEL_INEXPENSIVE: "low",
    PRICE_LEVEL_MODERATE: "medium",
    PRICE_LEVEL_EXPENSIVE: "high",
    PRICE_LEVEL_VERY_EXPENSIVE: "high",
  }[priceLevel]
  return level ? translate(`tripMap.priceLevels.${level}`) : translate("tripMap.priceLevels.unknown")
}
