import { z } from "zod"

export const SuggestionItemTypeSchema = z.enum(["activity", "meal"])
export const SuggestionDestinationSchema = z.enum(["plan", "backup"])
export const SuggestionSeasonSchema = z.enum(["any", "spring", "summer", "autumn", "winter"])
export const SuggestionSearchModeSchema = z.enum(["refine", "surprise", "similar"])
export const SuggestionRegionSchema = z.enum([
  "nordics",
  "europe",
  "north-america",
  "latin-america",
  "asia",
  "africa",
  "middle-east",
  "oceania",
  "global",
])

const suggestionQuestionOptionSchema = z.object({
  id: z.string().min(1),
  labelKey: z.string().min(1),
})

export const SuggestionQuestionSchema = z.object({
  id: z.string().min(1),
  promptKey: z.string().min(1),
  promptParams: z.record(z.string(), z.string()).optional(),
  region: SuggestionRegionSchema.optional(),
  options: suggestionQuestionOptionSchema.array().min(1),
})

export type SuggestionItemType = z.infer<typeof SuggestionItemTypeSchema>
export type SuggestionDestination = z.infer<typeof SuggestionDestinationSchema>
export type SuggestionSeason = z.infer<typeof SuggestionSeasonSchema>
export type SuggestionSearchMode = z.infer<typeof SuggestionSearchModeSchema>
export type SuggestionRegion = z.infer<typeof SuggestionRegionSchema>
export type SuggestionQuestion = z.infer<typeof SuggestionQuestionSchema>
type SuggestionCatalogQuestion = SuggestionQuestion & {
  itemType: SuggestionItemType
  region?: SuggestionRegion
}

const initialSuggestionQuestions: SuggestionCatalogQuestion[] = [
  {
    id: "activity-kind",
    promptKey: "suggestionHelper.questions.activityKind.prompt",
    itemType: "activity",
    options: [
      { id: "culture", labelKey: "suggestionHelper.questions.activityKind.options.culture" },
      { id: "nature", labelKey: "suggestionHelper.questions.activityKind.options.nature" },
      { id: "active", labelKey: "suggestionHelper.questions.activityKind.options.active" },
      { id: "shopping", labelKey: "suggestionHelper.questions.activityKind.options.shopping" },
      { id: "family", labelKey: "suggestionHelper.questions.activityKind.options.family" },
    ],
  },
  {
    id: "activity-mood",
    promptKey: "suggestionHelper.questions.activityMood.prompt",
    itemType: "activity",
    options: [
      { id: "calm", labelKey: "suggestionHelper.questions.activityMood.options.calm" },
      { id: "social", labelKey: "suggestionHelper.questions.activityMood.options.social" },
      { id: "local", labelKey: "suggestionHelper.questions.activityMood.options.local" },
      { id: "memorable", labelKey: "suggestionHelper.questions.activityMood.options.memorable" },
      { id: "weather-proof", labelKey: "suggestionHelper.questions.activityMood.options.weatherProof" },
    ],
  },
  {
    id: "activity-effort",
    promptKey: "suggestionHelper.questions.activityEffort.prompt",
    itemType: "activity",
    options: [
      { id: "short", labelKey: "suggestionHelper.questions.activityEffort.options.short" },
      { id: "easy", labelKey: "suggestionHelper.questions.activityEffort.options.easy" },
      { id: "moderate", labelKey: "suggestionHelper.questions.activityEffort.options.moderate" },
      { id: "adventurous", labelKey: "suggestionHelper.questions.activityEffort.options.adventurous" },
    ],
  },
  {
    id: "meal-occasion",
    promptKey: "suggestionHelper.questions.mealOccasion.prompt",
    itemType: "meal",
    options: [
      { id: "breakfast", labelKey: "suggestionHelper.questions.mealOccasion.options.breakfast" },
      { id: "lunch", labelKey: "suggestionHelper.questions.mealOccasion.options.lunch" },
      { id: "dinner", labelKey: "suggestionHelper.questions.mealOccasion.options.dinner" },
      { id: "coffee", labelKey: "suggestionHelper.questions.mealOccasion.options.coffee" },
      { id: "sweet", labelKey: "suggestionHelper.questions.mealOccasion.options.sweet" },
    ],
  },
  {
    id: "meal-style",
    promptKey: "suggestionHelper.questions.mealStyle.prompt",
    itemType: "meal",
    options: [
      { id: "local", labelKey: "suggestionHelper.questions.mealStyle.options.local" },
      { id: "international", labelKey: "suggestionHelper.questions.mealStyle.options.international" },
      { id: "vegetarian", labelKey: "suggestionHelper.questions.mealStyle.options.vegetarian" },
      { id: "casual", labelKey: "suggestionHelper.questions.mealStyle.options.casual" },
      { id: "special", labelKey: "suggestionHelper.questions.mealStyle.options.special" },
    ],
  },
  {
    id: "meal-mood",
    promptKey: "suggestionHelper.questions.mealMood.prompt",
    itemType: "meal",
    options: [
      { id: "quiet", labelKey: "suggestionHelper.questions.mealMood.options.quiet" },
      { id: "lively", labelKey: "suggestionHelper.questions.mealMood.options.lively" },
      { id: "scenic", labelKey: "suggestionHelper.questions.mealMood.options.scenic" },
      { id: "quick", labelKey: "suggestionHelper.questions.mealMood.options.quick" },
      { id: "cozy", labelKey: "suggestionHelper.questions.mealMood.options.cozy" },
    ],
  },
]

type GeneratedQuestionOption = {
  id: string
  labelKey: string
}

const regionalQuestionAngles = ["local", "culture", "food", "outdoors", "weather", "pace"] as const
const suggestionRegions: SuggestionRegion[] = [
  "nordics",
  "europe",
  "north-america",
  "latin-america",
  "asia",
  "africa",
  "middle-east",
  "oceania",
]

const nordicCountryCodes = new Set(["DK", "FI", "FO", "GL", "IS", "NO", "SE"])
const europeanCountryCodes = new Set([
  "AD",
  "AL",
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "EE",
  "ES",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "SM",
  "VA",
])

export function getSuggestionRegion(countryCode: string | null | undefined): SuggestionRegion {
  const code = countryCode?.trim().toUpperCase()
  if (!code) return "global"
  if (nordicCountryCodes.has(code)) return "nordics"
  if (europeanCountryCodes.has(code)) return "europe"
  if (["US", "CA"].includes(code)) return "north-america"
  if (["MX", "AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "NI", "PA", "PE", "PR", "UY", "VE"].includes(code)) {
    return "latin-america"
  }
  if (["CN", "HK", "IN", "ID", "JP", "KH", "KR", "LA", "MY", "MN", "NP", "PH", "SG", "TH", "TW", "VN"].includes(code)) {
    return "asia"
  }
  if (["DZ", "EG", "ET", "GH", "KE", "MA", "NG", "SN", "TZ", "TN", "ZA"].includes(code)) return "africa"
  if (["AE", "IL", "JO", "LB", "OM", "QA", "SA", "TR"].includes(code)) return "middle-east"
  if (["AU", "FJ", "NZ", "PF"].includes(code)) return "oceania"
  return "global"
}

const activityGeneratedOptionSets: GeneratedQuestionOption[][] = [
  [
    { id: "culture", labelKey: "suggestionHelper.questions.activityKind.options.culture" },
    { id: "nature", labelKey: "suggestionHelper.questions.activityKind.options.nature" },
    { id: "active", labelKey: "suggestionHelper.questions.activityKind.options.active" },
    { id: "shopping", labelKey: "suggestionHelper.questions.activityKind.options.shopping" },
    { id: "family", labelKey: "suggestionHelper.questions.activityKind.options.family" },
  ],
  [
    { id: "weather-indoor", labelKey: "suggestionHelper.generatedOptions.activity.indoor" },
    { id: "weather-outdoor", labelKey: "suggestionHelper.generatedOptions.activity.outdoor" },
    { id: "weather-any", labelKey: "suggestionHelper.generatedOptions.activity.anyWeather" },
  ],
  [
    { id: "time-morning", labelKey: "suggestionHelper.generatedOptions.activity.morning" },
    { id: "time-day", labelKey: "suggestionHelper.generatedOptions.activity.daytime" },
    { id: "time-evening", labelKey: "suggestionHelper.generatedOptions.activity.evening" },
  ],
  [
    { id: "social-solo", labelKey: "suggestionHelper.generatedOptions.activity.solo" },
    { id: "social-together", labelKey: "suggestionHelper.generatedOptions.activity.together" },
    { id: "social-group", labelKey: "suggestionHelper.generatedOptions.activity.group" },
  ],
  [
    { id: "scenery-water", labelKey: "suggestionHelper.generatedOptions.activity.water" },
    { id: "scenery-green", labelKey: "suggestionHelper.generatedOptions.activity.green" },
    { id: "scenery-city", labelKey: "suggestionHelper.generatedOptions.activity.city" },
  ],
  [
    { id: "pace-quick", labelKey: "suggestionHelper.generatedOptions.activity.quick" },
    { id: "pace-relaxed", labelKey: "suggestionHelper.generatedOptions.activity.relaxed" },
    { id: "pace-full-day", labelKey: "suggestionHelper.generatedOptions.activity.fullDay" },
  ],
  [
    { id: "novelty-classic", labelKey: "suggestionHelper.generatedOptions.activity.classic" },
    { id: "novelty-hidden", labelKey: "suggestionHelper.generatedOptions.activity.hidden" },
    { id: "novelty-unusual", labelKey: "suggestionHelper.generatedOptions.activity.unusual" },
  ],
  [
    { id: "effort-gentle", labelKey: "suggestionHelper.generatedOptions.activity.gentle" },
    { id: "effort-active", labelKey: "suggestionHelper.generatedOptions.activity.active" },
    { id: "effort-challenging", labelKey: "suggestionHelper.generatedOptions.activity.challenging" },
  ],
  [
    { id: "setting-inside", labelKey: "suggestionHelper.generatedOptions.activity.inside" },
    { id: "setting-outside", labelKey: "suggestionHelper.generatedOptions.activity.outside" },
    { id: "setting-mixed", labelKey: "suggestionHelper.generatedOptions.activity.mixed" },
  ],
  [
    { id: "access-easy", labelKey: "suggestionHelper.generatedOptions.activity.easyAccess" },
    { id: "access-transit", labelKey: "suggestionHelper.generatedOptions.activity.transit" },
    { id: "access-walk", labelKey: "suggestionHelper.generatedOptions.activity.walking" },
  ],
]

const mealGeneratedOptionSets: GeneratedQuestionOption[][] = [
  [
    { id: "breakfast", labelKey: "suggestionHelper.questions.mealOccasion.options.breakfast" },
    { id: "lunch", labelKey: "suggestionHelper.questions.mealOccasion.options.lunch" },
    { id: "dinner", labelKey: "suggestionHelper.questions.mealOccasion.options.dinner" },
    { id: "coffee", labelKey: "suggestionHelper.questions.mealOccasion.options.coffee" },
    { id: "sweet", labelKey: "suggestionHelper.questions.mealOccasion.options.sweet" },
  ],
  [
    { id: "cuisine-local", labelKey: "suggestionHelper.generatedOptions.meal.local" },
    { id: "cuisine-asian", labelKey: "suggestionHelper.generatedOptions.meal.asian" },
    { id: "cuisine-european", labelKey: "suggestionHelper.generatedOptions.meal.european" },
    { id: "cuisine-global", labelKey: "suggestionHelper.generatedOptions.meal.global" },
  ],
  [
    { id: "diet-any", labelKey: "suggestionHelper.generatedOptions.meal.anyDiet" },
    { id: "diet-vegetarian", labelKey: "suggestionHelper.generatedOptions.meal.vegetarian" },
    { id: "diet-vegan", labelKey: "suggestionHelper.generatedOptions.meal.vegan" },
    { id: "diet-gluten-free", labelKey: "suggestionHelper.generatedOptions.meal.glutenFree" },
  ],
  [
    { id: "setting-casual", labelKey: "suggestionHelper.generatedOptions.meal.casual" },
    { id: "setting-special", labelKey: "suggestionHelper.generatedOptions.meal.special" },
    { id: "setting-cozy", labelKey: "suggestionHelper.generatedOptions.meal.cozy" },
    { id: "setting-lively", labelKey: "suggestionHelper.generatedOptions.meal.lively" },
  ],
  [
    { id: "meal-pace-quick", labelKey: "suggestionHelper.generatedOptions.meal.quick" },
    { id: "pace-unhurried", labelKey: "suggestionHelper.generatedOptions.meal.unhurried" },
    { id: "pace-tasting", labelKey: "suggestionHelper.generatedOptions.meal.tasting" },
  ],
  [
    { id: "location-central", labelKey: "suggestionHelper.generatedOptions.meal.central" },
    { id: "location-scenic", labelKey: "suggestionHelper.generatedOptions.meal.scenic" },
    { id: "location-neighborhood", labelKey: "suggestionHelper.generatedOptions.meal.neighborhood" },
  ],
  [
    { id: "company-solo", labelKey: "suggestionHelper.generatedOptions.meal.solo" },
    { id: "company-two", labelKey: "suggestionHelper.generatedOptions.meal.two" },
    { id: "company-group", labelKey: "suggestionHelper.generatedOptions.meal.group" },
  ],
  [
    { id: "budget-value", labelKey: "suggestionHelper.generatedOptions.meal.value" },
    { id: "budget-midrange", labelKey: "suggestionHelper.generatedOptions.meal.midrange" },
    { id: "budget-special", labelKey: "suggestionHelper.generatedOptions.meal.specialBudget" },
  ],
  [
    { id: "experience-familiar", labelKey: "suggestionHelper.generatedOptions.meal.familiar" },
    { id: "experience-new", labelKey: "suggestionHelper.generatedOptions.meal.new" },
    { id: "experience-local", labelKey: "suggestionHelper.generatedOptions.meal.localExperience" },
  ],
  [
    { id: "atmosphere-quiet", labelKey: "suggestionHelper.generatedOptions.meal.quiet" },
    { id: "atmosphere-social", labelKey: "suggestionHelper.generatedOptions.meal.social" },
    { id: "atmosphere-romantic", labelKey: "suggestionHelper.generatedOptions.meal.romantic" },
  ],
]

const activityPromptFocuses = [
  "energy",
  "weather",
  "company",
  "surroundings",
  "pace",
  "novelty",
  "culture",
  "movement",
  "time",
  "access",
] as const

const activityPromptDetails = [
  "today",
  "tomorrow",
  "morning",
  "afternoon",
  "evening",
  "betweenPlans",
  "withTime",
  "nearby",
  "onFoot",
  "ifWeatherChanges",
  "onAQuietDay",
  "whenYouWantToExplore",
  "whenYouWantToLearn",
  "whenYouWantAView",
  "forAFirstVisit",
  "forAReturnVisit",
  "whenYouWantToTakePhotos",
  "whenYouNeedABreak",
  "whenYouWantLocalLife",
  "whenYouWantAnEveningOut",
] as const

const mealPromptFocuses = [
  "occasion",
  "cuisine",
  "diet",
  "atmosphere",
  "pace",
  "location",
  "company",
  "budget",
  "experience",
  "mood",
] as const

const mealPromptDetails = [
  "rightNow",
  "afterActivity",
  "beforeActivity",
  "withTime",
  "nearby",
  "forTheGroup",
  "forTwo",
  "asSomethingNew",
  "withLocalFlavor",
  "ifWeatherChanges",
  "forBreakfast",
  "forLunchWithTime",
  "forDinnerWithFriends",
  "whenYouWantSomethingLight",
  "whenYouWantSomethingFilling",
  "whenYouWantToCelebrate",
  "whenYouWantToTrySomethingLocal",
  "whenYouWantToSitOutside",
  "whenYouWantAQuickStop",
  "whenYouWantDessert",
] as const

function createGeneratedQuestions(
  itemType: "activity" | "meal",
  focuses: readonly string[],
  details: readonly string[],
  optionSets: GeneratedQuestionOption[][],
  optionSetByFocus: readonly number[],
): SuggestionCatalogQuestion[] {
  return focuses.flatMap((focus, focusIndex) =>
    details.map((detail, detailIndex) => ({
      id: `${itemType}-${focus}-${detail}`,
      itemType,
      options:
        optionSets[optionSetByFocus[focusIndex] ?? focusIndex % optionSets.length] ?? optionSets[0],
      promptKey: `suggestionHelper.generatedPrompts.${itemType}Variants.${(focusIndex + detailIndex) % 8}`,
      promptParams: {
        detail: `suggestionHelper.generatedDetails.${itemType}.${detail}`,
        focus: `suggestionHelper.generatedFocuses.${itemType}.${focus}`,
      },
    })),
  )
}

function createRegionalQuestions(
  itemType: SuggestionItemType,
  optionSets: GeneratedQuestionOption[][],
): SuggestionCatalogQuestion[] {
  return suggestionRegions.flatMap((region, regionIndex) =>
    regionalQuestionAngles.map((angle, angleIndex) => ({
      id: `${itemType}-regional-${region}-${angle}`,
      itemType,
      region,
      options: optionSets[(regionIndex + angleIndex) % optionSets.length] ?? optionSets[0],
      promptKey: `suggestionHelper.regionalPrompts.${itemType}`,
      promptParams: {
        angle: `suggestionHelper.regionalAngles.${angle}`,
        region: `suggestionHelper.regions.${region}`,
      },
    })),
  )
}

export const SUGGESTION_QUESTION_CATALOG: SuggestionCatalogQuestion[] = [
  ...initialSuggestionQuestions,
  ...createGeneratedQuestions(
    "activity",
    activityPromptFocuses,
    activityPromptDetails,
    activityGeneratedOptionSets,
    [7, 1, 3, 4, 5, 6, 0, 7, 2, 9],
  ),
  ...createGeneratedQuestions(
    "meal",
    mealPromptFocuses,
    mealPromptDetails,
    mealGeneratedOptionSets,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  ),
  ...createRegionalQuestions("activity", activityGeneratedOptionSets),
  ...createRegionalQuestions("meal", mealGeneratedOptionSets),
]

const suggestionQuestionCatalogSchema = SuggestionQuestionSchema.extend({
  itemType: SuggestionItemTypeSchema,
})

export const SuggestionQuestionCatalogSchema = suggestionQuestionCatalogSchema.array()
export const SuggestionAnswerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
})

export const GooglePlaceSuggestionSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: z.string().nullable(),
  priceLevel: z.string().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  userRatingCount: z.number().int().nonnegative().nullable(),
  googleMapsUrl: z.string().url(),
  photoNames: z.string().min(1).array().max(4).default([]),
  matchOptionIds: z.string().min(1).array().max(3).default([]),
  distanceMeters: z.number().nonnegative(),
})

export const GooglePlaceSuggestionsInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    itemType: SuggestionItemTypeSchema,
    season: SuggestionSeasonSchema.default("any"),
    searchMode: SuggestionSearchModeSchema.default("refine"),
    categoryHint: z.string().trim().min(1).max(100).optional(),
    answers: SuggestionAnswerSchema.array().max(100),
    excludedPlaceIds: z.string().min(1).array().max(100),
  })
  .superRefine((input, context) => {
    const answeredQuestions = new Set<string>()

    for (const [index, answer] of input.answers.entries()) {
      const question = SUGGESTION_QUESTION_CATALOG.find(
        (candidate) => candidate.id === answer.questionId,
      )
      const option = question?.options.find((candidate) => candidate.id === answer.optionId)

      if (!question || question.itemType !== input.itemType || !option) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Suggestion answer is invalid for the selected item type",
          path: ["answers", index],
        })
      }

      if (answeredQuestions.has(answer.questionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Suggestion questions must be unique",
          path: ["answers", index, "questionId"],
        })
      }
      answeredQuestions.add(answer.questionId)
    }
  })

export const GooglePlaceSuggestionsSchema = GooglePlaceSuggestionSchema.array().max(10)

export type SuggestionAnswer = z.infer<typeof SuggestionAnswerSchema>
export type GooglePlaceSuggestion = z.infer<typeof GooglePlaceSuggestionSchema>
export type GooglePlaceSuggestionsInput = z.input<typeof GooglePlaceSuggestionsInputSchema>
