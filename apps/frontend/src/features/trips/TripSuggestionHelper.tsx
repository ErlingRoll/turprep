import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  createActivity,
  createMeal,
  getGooglePlaceSuggestions,
  type GooglePlaceSuggestion,
  type TripDetail,
} from "../../api"
import { getErrorMessage } from "../../lib/errors"
import { formatDate } from "../../lib/date-format"
import { formatGooglePriceLevel } from "../../lib/google-place-format"
import { sortActivities } from "../../lib/activity-format"
import { SuggestionMediaGallery } from "./SuggestionMediaGallery"
import {
  getSuggestionSessionState,
  updateSuggestionSessionState,
} from "./suggestion-session"
import {
  SUGGESTION_QUESTION_CATALOG,
  getSuggestionRegion,
  SuggestionSeasonSchema,
  type SuggestionAnswer,
  type SuggestionItemType,
  type SuggestionQuestion,
  type SuggestionRegion,
  type SuggestionSeason,
} from "@turprep/models"

export type SuggestionPin = {
  latitude: number
  longitude: number
}

type TripSuggestionHelperProps = {
  accessToken: string
  onReset: () => void
  onSuggestionSelect: (suggestion: GooglePlaceSuggestion) => void
  onSuggestionsChange: (suggestions: GooglePlaceSuggestion[]) => void
  onTripUpdated: (trip: TripDetail) => void
  pin: SuggestionPin | null
  selectedSuggestionPlaceId: string | null
  trip: TripDetail
}

function getSuggestionQuestions(itemType: SuggestionItemType | null) {
  return itemType
    ? SUGGESTION_QUESTION_CATALOG.filter((question) => question.itemType === itemType)
    : []
}

const RECENT_QUESTION_LIMIT = 100
const MIN_ANSWERS_FOR_RESULTS = 3
const SUGGESTION_SEASON_STORAGE_KEY = "turprep.suggestion-season"
const SUGGESTION_RECENT_QUESTIONS_STORAGE_KEY = "turprep.suggestion-recent-questions"

function getStoredSuggestionSeason(): SuggestionSeason {
  if (typeof window === "undefined") {
    return "any"
  }

  const storedSeason = window.sessionStorage.getItem(SUGGESTION_SEASON_STORAGE_KEY)
  const parsedSeason = SuggestionSeasonSchema.safeParse(storedSeason)
  return parsedSeason.success ? parsedSeason.data : "any"
}

function getStoredRecentQuestionIds(itemType: SuggestionItemType): string[] {
  if (typeof window === "undefined") {
    return []
  }

  return (
    window.sessionStorage
      .getItem(`${SUGGESTION_RECENT_QUESTIONS_STORAGE_KEY}.${itemType}`)
      ?.split(",")
      .filter(Boolean)
      .slice(-RECENT_QUESTION_LIMIT) ?? []
  )
}

function storeRecentQuestionIds(itemType: SuggestionItemType, questionIds: string[]) {
  window.sessionStorage.setItem(
    `${SUGGESTION_RECENT_QUESTIONS_STORAGE_KEY}.${itemType}`,
    questionIds.slice(-RECENT_QUESTION_LIMIT).join(","),
  )
}

function chooseNextQuestion(
  questions: readonly SuggestionQuestion[],
  recentQuestionIds: readonly string[],
  region: SuggestionRegion,
) {
  const availableQuestions = questions.filter((question) => !recentQuestionIds.includes(question.id))
  const regionalCandidates =
    region === "global"
      ? []
      : availableQuestions.filter((question) => question.region === region)
  const nonRegionalCandidates = availableQuestions.filter((question) => !question.region)
  const candidates =
    regionalCandidates.length > 0
      ? regionalCandidates
      : nonRegionalCandidates.length > 0
        ? nonRegionalCandidates
        : availableQuestions.length > 0
          ? availableQuestions
          : questions.filter((question) => question.id !== recentQuestionIds.at(-1))

  const recentQuestions = recentQuestionIds
    .slice(-6)
    .map((questionId) => questions.find((question) => question.id === questionId))
    .filter((question): question is SuggestionQuestion => question !== undefined)
  const recentTopics = new Set(
    recentQuestions.flatMap((question) =>
      ["focus", "angle", "detail"].flatMap((key) => {
        const value = question.promptParams?.[key]
        return value ? [value] : []
      }),
    ),
  )
  const diverseCandidates = candidates.filter((question) => {
    const topics = ["focus", "angle", "detail"].flatMap((key) => {
      const value = question.promptParams?.[key]
      return value ? [value] : []
    })
    return topics.length === 0 || topics.every((topic) => !recentTopics.has(topic))
  })
  const recentPromptKeys = new Set(recentQuestions.map((question) => question.promptKey))
  const variedCandidates = diverseCandidates.filter((question) => !recentPromptKeys.has(question.promptKey))
  const selectionPool =
    variedCandidates.length > 0
      ? variedCandidates
      : diverseCandidates.length > 0
        ? diverseCandidates
        : candidates

  return selectionPool[Math.floor(Math.random() * selectionPool.length)]?.id ?? null
}

export function TripSuggestionHelper({
  accessToken,
  onReset,
  onSuggestionSelect,
  onSuggestionsChange,
  onTripUpdated,
  pin,
  selectedSuggestionPlaceId,
  trip,
}: TripSuggestionHelperProps) {
  const { t } = useTranslation()
  const [storedSuggestionSession] = useState(() => getSuggestionSessionState(trip.id))
  const [itemType, setItemType] = useState<SuggestionItemType | null>(
    () => storedSuggestionSession?.itemType ?? null,
  )
  const [season, setSeason] = useState<SuggestionSeason>(
    () => storedSuggestionSession?.season ?? getStoredSuggestionSeason(),
  )
  const [region, setRegion] = useState<SuggestionRegion>(
    () => storedSuggestionSession?.region ?? "global",
  )
  const [searchMode, setSearchMode] = useState<"refine" | "surprise" | "similar">(
    () => storedSuggestionSession?.searchMode ?? "refine",
  )
  const [searchRefreshKey, setSearchRefreshKey] = useState(0)
  const [categoryHint, setCategoryHint] = useState<string | null>(
    () => storedSuggestionSession?.categoryHint ?? null,
  )
  const [answers, setAnswers] = useState<SuggestionAnswer[]>(
    () => storedSuggestionSession?.answers ?? [],
  )
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>(
    () => storedSuggestionSession?.recentQuestionIds ?? [],
  )
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(
    () => storedSuggestionSession?.currentQuestionId ?? null,
  )
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>(
    () => storedSuggestionSession?.suggestions ?? [],
  )
  const [addedPlaceIds, setAddedPlaceIds] = useState<Set<string>>(
    () => new Set(storedSuggestionSession?.addedPlaceIds ?? []),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState<string | null>(null)
  const [pendingSuggestion, setPendingSuggestion] = useState<GooglePlaceSuggestion | null>(
    () => storedSuggestionSession?.pendingSuggestion ?? null,
  )
  const [pendingDestination, setPendingDestination] = useState<"plan" | "backup" | null>(
    () => storedSuggestionSession?.pendingDestination ?? null,
  )
  const [pendingDate, setPendingDate] = useState(
    () => storedSuggestionSession?.pendingDate ?? "",
  )
  const [error, setError] = useState<string | null>(null)
  const excludedPlaceIdsRef = useRef<Set<string>>(new Set())
  const requestIdRef = useRef(0)
  const suggestionCardRefs = useRef<Record<string, HTMLElement | null>>({})
  const pinKey = pin ? `${pin.latitude}:${pin.longitude}` : null
  const previousPinKeyRef = useRef(pinKey)

  const questions = useMemo(() => getSuggestionQuestions(itemType), [itemType])
  const currentQuestion = questions.find((question) => question.id === currentQuestionId) ?? null
  const suggestionReasonsByPlaceId = useMemo(
    () => {
      const reasonEntries: Array<[string, string[]]> = suggestions.map((suggestion) => {
        const reasons = suggestion.matchOptionIds
          .map((optionId) => {
            const answer = answers.find((candidate) => candidate.optionId === optionId)
            const question = answer
              ? questions.find((candidate) => candidate.id === answer.questionId)
              : undefined
            return question?.options.find((option) => option.id === optionId)
          })
          .filter((option): option is NonNullable<typeof option> => option !== undefined)
          .map((option) => t(option.labelKey))

        if (searchMode === "similar" && categoryHint && suggestion.category === categoryHint) {
          reasons.push(t("suggestionHelper.matchReasons.category", { category: suggestion.category }))
        }
        if (suggestion.distanceMeters <= 2000) {
          reasons.push(t("suggestionHelper.matchReasons.nearby"))
        }
        if (suggestion.rating !== null && suggestion.rating >= 4.5) {
          reasons.push(t("suggestionHelper.matchReasons.highlyRated"))
        }
        return [suggestion.placeId, reasons]
      })
      return new Map(reasonEntries)
    },
    [answers, categoryHint, questions, searchMode, suggestions, t],
  )

  function clearSuggestionResults() {
    setAnswers([])
    setRecentQuestionIds([])
    setCurrentQuestionId(null)
    setSearchMode("refine")
    setCategoryHint(null)
    setSuggestions([])
    onSuggestionsChange([])
    excludedPlaceIdsRef.current = new Set()
    setAddedPlaceIds(new Set())
    setPendingSuggestion(null)
    setPendingDestination(null)
    setPendingDate("")
    setError(null)
  }

  useEffect(() => {
    if (!pin || typeof google === "undefined" || !google.maps?.Geocoder) {
      setRegion("global")
      return
    }

    let isCancelled = false
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode(
      { location: { lat: pin.latitude, lng: pin.longitude } },
      (results, status) => {
        if (isCancelled) return
        if (status !== google.maps.GeocoderStatus.OK) {
          setRegion("global")
          return
        }
        const countryCode = results?.flatMap((result) => result.address_components ?? [])
          .find((component) => component.types.includes("country"))?.short_name
        setRegion(getSuggestionRegion(countryCode))
      },
    )

    return () => {
      isCancelled = true
    }
  }, [pin])

  useEffect(() => {
    if (previousPinKeyRef.current === pinKey) {
      return
    }

    previousPinKeyRef.current = pinKey
    setSuggestions([])
    onSuggestionsChange([])
    setPendingSuggestion(null)
    setPendingDestination(null)
    setPendingDate("")
    setError(null)
  }, [onSuggestionsChange, pinKey])

  useEffect(() => {
    window.sessionStorage.setItem(SUGGESTION_SEASON_STORAGE_KEY, season)
  }, [season])

  useEffect(() => {
    updateSuggestionSessionState(trip.id, {
      itemType,
      season,
      region,
      searchMode,
      categoryHint,
      answers,
      recentQuestionIds,
      currentQuestionId,
      suggestions,
      addedPlaceIds: Array.from(addedPlaceIds),
      pendingSuggestion,
      pendingDestination,
      pendingDate,
    })
  }, [
    addedPlaceIds,
    answers,
    categoryHint,
    currentQuestionId,
    itemType,
    pendingDate,
    pendingDestination,
    pendingSuggestion,
    recentQuestionIds,
    region,
    searchMode,
    season,
    suggestions,
    trip.id,
  ])

  useEffect(() => {
    if (!selectedSuggestionPlaceId) {
      return
    }

    suggestionCardRefs.current[selectedSuggestionPlaceId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    })
  }, [selectedSuggestionPlaceId])

  function handleItemTypeChange(nextItemType: SuggestionItemType) {
    clearSuggestionResults()
    const storedRecentQuestionIds = getStoredRecentQuestionIds(nextItemType)
    setItemType(nextItemType)
    setRecentQuestionIds(storedRecentQuestionIds)
    setCurrentQuestionId(
      chooseNextQuestion(getSuggestionQuestions(nextItemType), storedRecentQuestionIds, region),
    )
  }

  function advanceQuestion(questionId: string) {
    const nextRecentQuestionIds = [...recentQuestionIds, questionId].slice(-RECENT_QUESTION_LIMIT)
    setRecentQuestionIds(nextRecentQuestionIds)
    if (itemType) {
      storeRecentQuestionIds(itemType, nextRecentQuestionIds)
    }
    setCurrentQuestionId(chooseNextQuestion(questions, nextRecentQuestionIds, region))
  }

  function handleAnswer(questionId: string, optionId: string) {
    excludedPlaceIdsRef.current = new Set()
    setSearchMode("refine")
    setCategoryHint(null)
    setAnswers((currentAnswers) =>
      [...currentAnswers.filter((answer) => answer.questionId !== questionId), { questionId, optionId }].slice(
        -100,
      ),
    )
    advanceQuestion(questionId)
    setError(null)
  }

  function handleRemoveAnswer(questionId: string) {
    excludedPlaceIdsRef.current = new Set()
    setAnswers((currentAnswers) => currentAnswers.filter((answer) => answer.questionId !== questionId))
    setSearchMode("refine")
    setCategoryHint(null)
    setError(null)
  }

  function handleSurpriseMe() {
    if (!itemType) return
    const nextExcludedPlaceIds = new Set(excludedPlaceIdsRef.current)
    suggestions.forEach((suggestion) => nextExcludedPlaceIds.add(suggestion.placeId))
    excludedPlaceIdsRef.current = nextExcludedPlaceIds
    setAnswers([])
    setSearchMode("surprise")
    setCategoryHint(null)
    setSearchRefreshKey((currentKey) => currentKey + 1)
    setError(null)
  }

  function handleMoreLikeThis(suggestion: GooglePlaceSuggestion) {
    if (!itemType) return
    excludedPlaceIdsRef.current = new Set([suggestion.placeId])
    setSearchMode("similar")
    setCategoryHint(suggestion.category)
    setError(null)
  }

  function handleSkip(questionId: string) {
    advanceQuestion(questionId)
    setError(null)
  }

  function handleSelectSuggestion(suggestion: GooglePlaceSuggestion) {
    setPendingSuggestion(suggestion)
    setPendingDestination(null)
    setPendingDate("")
    setError(null)
  }

  async function handleConfirmAddSuggestion() {
    if (
      !itemType ||
      !pendingSuggestion ||
      !pendingDestination ||
      (pendingDestination === "plan" && !pendingDate)
    ) {
      return
    }

    setIsAdding(pendingSuggestion.placeId)
    setError(null)

    try {
      const input = {
        tripDate: pendingDestination === "plan" ? pendingDate : null,
        isBackup: pendingDestination === "backup",
        title: pendingSuggestion.name,
        startTime: null,
        endTime: null,
        allDay: true,
        notes: null,
        googleMapsUrl: pendingSuggestion.googleMapsUrl,
        placeName: pendingSuggestion.name,
        placeAddress: pendingSuggestion.address,
        latitude: pendingSuggestion.latitude,
        longitude: pendingSuggestion.longitude,
        priceAmount: null,
        priceCurrency: null,
        website: null,
      }

      if (itemType === "activity") {
        const savedActivity = await createActivity(accessToken, trip.id, input)
        onTripUpdated(
          pendingDestination === "backup"
            ? { ...trip, backupActivities: [...trip.backupActivities, savedActivity] }
            : {
                ...trip,
                days: trip.days.map((day) =>
                  day.date === pendingDate
                    ? { ...day, activities: sortActivities([...day.activities, savedActivity]) }
                    : day,
                ),
              },
        )
      } else {
        const savedMeal = await createMeal(accessToken, trip.id, input)
        onTripUpdated({ ...trip, meals: [...trip.meals, savedMeal] })
      }

      setAddedPlaceIds((currentIds) => new Set(currentIds).add(pendingSuggestion.placeId))
      setPendingSuggestion(null)
      setPendingDestination(null)
      setPendingDate("")
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsAdding(null)
    }
  }

  useEffect(() => {
    const shouldSearch =
      searchMode === "surprise" || answers.length >= MIN_ANSWERS_FOR_RESULTS
    if (!pin || !itemType || !shouldSearch) {
      setSuggestions([])
      onSuggestionsChange([])
      setIsLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    let isCancelled = false
    setIsLoading(true)
    setError(null)

    void getGooglePlaceSuggestions(accessToken, {
      latitude: pin.latitude,
      longitude: pin.longitude,
      itemType,
      season,
      searchMode,
      categoryHint: categoryHint ?? undefined,
      answers,
      excludedPlaceIds: Array.from(excludedPlaceIdsRef.current).slice(-100),
    })
      .then((nextSuggestions) => {
        if (isCancelled || requestId !== requestIdRef.current) {
          return
        }

        setSuggestions(nextSuggestions)
        onSuggestionsChange(nextSuggestions)
      })
      .catch((reason: unknown) => {
        if (!isCancelled && requestId === requestIdRef.current) {
          setError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (!isCancelled && requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [
    accessToken,
    answers,
    categoryHint,
    itemType,
    onSuggestionsChange,
    pin,
    searchMode,
    season,
    searchRefreshKey,
  ])

  useEffect(() => {
    if (itemType && answers.length === 0) {
      setCurrentQuestionId(chooseNextQuestion(questions, recentQuestionIds, region))
    }
  }, [answers.length, itemType, questions, recentQuestionIds, region])

  return (
    <aside className="hidden h-full w-[min(48rem,45vw)] min-w-96 flex-col overflow-hidden border-l border-border-divider bg-surface lg:flex">
      <div className="flex items-start justify-between gap-3 border-b border-border-divider p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("suggestionHelper.eyebrow")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-brand">{t("suggestionHelper.title")}</h2>
        </div>
        <button
          className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
          onClick={onReset}
          type="button"
        >
          {t("suggestionHelper.reset")}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {!pin ? (
          <p className="rounded-xl bg-surface-soft p-3 text-sm leading-6 text-muted">
            {t("suggestionHelper.dropPin")}
          </p>
        ) : (
          <>
            <section>
              <p className="text-sm font-semibold text-on-surface">{t("suggestionHelper.findType")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["activity", "meal"] as const).map((type) => (
                  <button
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                      itemType === type
                        ? "border-brand bg-brand-surface text-on-brand"
                        : "border-border bg-surface text-on-surface hover:border-brand"
                    }`}
                    key={type}
                    onClick={() => handleItemTypeChange(type)}
                    type="button"
                  >
                    {t(`suggestionHelper.types.${type}`)}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-semibold text-on-surface">
                {t("suggestionHelper.season")}
                <select
                  aria-label={t("suggestionHelper.season")}
                  className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal text-on-surface"
                  onChange={(event) => setSeason(event.target.value as SuggestionSeason)}
                  value={season}
                >
                  {(["any", "spring", "summer", "autumn", "winter"] as const).map((option) => (
                    <option key={option} value={option}>
                      {t(`suggestionHelper.seasons.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {itemType && (
              <section>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-muted">{t("suggestionHelper.pinRadius")}</span>
                  {answers.length < MIN_ANSWERS_FOR_RESULTS && (
                    <button
                      className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface hover:border-brand"
                      onClick={handleSurpriseMe}
                      type="button"
                    >
                      {t("suggestionHelper.surpriseMe")}
                    </button>
                  )}
                </div>

                {currentQuestion && (
                  <div className="mt-3 rounded-xl bg-surface-soft p-3">
                    <p className="text-sm font-semibold text-on-surface">
                      {t(
                        currentQuestion.promptKey,
                        Object.fromEntries(
                          Object.entries(currentQuestion.promptParams ?? {}).map(([key, value]) => [
                            key,
                            t(value),
                          ]),
                        ),
                      )}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {currentQuestion.options.map((option) => (
                        <button
                          className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-on-surface hover:border-brand"
                          key={option.id}
                          onClick={() => handleAnswer(currentQuestion.id, option.id)}
                          type="button"
                        >
                          {t(option.labelKey)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
                      onClick={() => handleSkip(currentQuestion.id)}
                      type="button"
                    >
                      {t("suggestionHelper.skip")}
                    </button>
                  </div>
                )}
              </section>
            )}

            {itemType && (
              <section className="rounded-xl border border-border-soft bg-surface-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-on-surface">
                  {t("suggestionHelper.preferences")}
                </p>
                <span className="text-xs text-muted">
                  {t("suggestionHelper.regionAdapted", {
                    region: t(`suggestionHelper.regions.${region}`),
                  })}
                </span>
              </div>
              {answers.length === 0 ? (
                <p className="mt-2 text-xs text-muted">{t("suggestionHelper.noPreferences")}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {answers.map((answer) => {
                    const question = questions.find((candidate) => candidate.id === answer.questionId)
                    const option = question?.options.find((candidate) => candidate.id === answer.optionId)
                    if (!question || !option) return null

                    return (
                      <button
                        aria-label={t("suggestionHelper.removePreference", {
                          preference: t(option.labelKey),
                        })}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-on-surface hover:border-brand"
                        key={answer.questionId}
                        onClick={() => handleRemoveAnswer(answer.questionId)}
                        type="button"
                      >
                        {t(option.labelKey)} ×
                      </button>
                    )
                  })}
                </div>
              )}
              </section>
            )}

            {pendingSuggestion && (
              <section className="rounded-xl border border-border-soft bg-surface-soft p-3">
                <p className="text-sm font-semibold text-on-surface">
                  {t("suggestionHelper.addTo", { name: pendingSuggestion.name })}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(["plan", "backup"] as const).map((nextDestination) => (
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                        pendingDestination === nextDestination
                          ? "border-brand bg-brand-surface text-on-brand"
                          : "border-border bg-surface text-on-surface hover:border-brand"
                      }`}
                      key={nextDestination}
                      onClick={() => {
                        setPendingDestination(nextDestination)
                        if (nextDestination === "backup") {
                          setPendingDate("")
                        }
                      }}
                      type="button"
                    >
                      {t(`suggestionHelper.destinations.${nextDestination}`)}
                    </button>
                  ))}
                </div>
                {pendingDestination === "plan" && (
                  <select
                    aria-label={t("suggestionHelper.chooseDay")}
                    className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-on-surface"
                    onChange={(event) => setPendingDate(event.target.value)}
                    value={pendingDate}
                  >
                    <option value="">{t("suggestionHelper.chooseDay")}</option>
                    {trip.days.map((day) => (
                      <option key={day.date} value={day.date}>
                        {formatDate(day.date)}
                        {day.title ? ` · ${day.title}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-lg bg-brand-surface px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      isAdding !== null ||
                      !pendingDestination ||
                      (pendingDestination === "plan" && !pendingDate)
                    }
                    onClick={() => void handleConfirmAddSuggestion()}
                    type="button"
                  >
                    {isAdding === pendingSuggestion.placeId
                      ? t("common.saving")
                      : t("suggestionHelper.confirmAdd")}
                  </button>
                  <button
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-on-surface hover:border-brand"
                    disabled={isAdding !== null}
                    onClick={() => {
                      setPendingSuggestion(null)
                      setPendingDestination(null)
                      setPendingDate("")
                    }}
                    type="button"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </section>
            )}

            {isLoading && (
              <p className="rounded-xl bg-surface-soft p-3 text-sm text-muted">
                {suggestions.length > 0
                  ? t("suggestionHelper.updating")
                  : t("suggestionHelper.loading")}
              </p>
            )}
            {error && (
              <p className="rounded-xl bg-warning-surface p-3 text-sm text-warning-body" role="alert">
                {error}
              </p>
            )}
            {!isLoading &&
              searchMode !== "surprise" &&
              answers.length > 0 &&
              answers.length < MIN_ANSWERS_FOR_RESULTS && (
                <p className="rounded-xl bg-surface-soft p-3 text-sm text-muted">
                  {t("suggestionHelper.moreAnswersForResults", {
                    count: MIN_ANSWERS_FOR_RESULTS - answers.length,
                  })}
                </p>
              )}
            {!isLoading &&
              (searchMode === "surprise" || answers.length >= MIN_ANSWERS_FOR_RESULTS) &&
              (searchMode === "surprise" || answers.length > 0) &&
              suggestions.length === 0 &&
              !error && (
              <p className="rounded-xl bg-surface-soft p-3 text-sm text-muted">
                {t("suggestionHelper.noSuggestions")}
              </p>
              )}
            {suggestions.length > 0 && (
              <section className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface">
                    {t("suggestionHelper.results")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-brand"
                      onClick={handleSurpriseMe}
                      type="button"
                    >
                      {t("suggestionHelper.surpriseMe")}
                    </button>
                  </div>
                </div>
                {suggestions.length < 4 && (
                  <p className="rounded-xl bg-surface-soft p-3 text-sm text-muted">
                    {t("suggestionHelper.fewSuggestions", { count: suggestions.length })}
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {suggestions.map((suggestion) => {
                    const matchReasons = suggestionReasonsByPlaceId.get(suggestion.placeId) ?? []

                    return (
                      <article
                        className={`rounded-xl border border-border-card bg-surface-soft p-3 ${
                          selectedSuggestionPlaceId === suggestion.placeId
                            ? "border-brand ring-2 ring-brand/30"
                            : ""
                        }`}
                        key={suggestion.placeId}
                        ref={(element) => {
                          suggestionCardRefs.current[suggestion.placeId] = element
                        }}
                      >
                        <SuggestionMediaGallery accessToken={accessToken} suggestion={suggestion} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-brand">{suggestion.name}</h3>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-muted">
                            {Math.round(suggestion.distanceMeters)} m
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                          {suggestion.category && <span>{suggestion.category}</span>}
                          {suggestion.rating !== null && (
                            <span>
                              ★ {suggestion.rating.toFixed(1)}
                              {suggestion.userRatingCount !== null
                                ? ` (${suggestion.userRatingCount})`
                                : ""}
                            </span>
                          )}
                          {suggestion.priceLevel && (
                            <span>{formatGooglePriceLevel(suggestion.priceLevel, t)}</span>
                          )}
                        </div>
                        {matchReasons.length > 0 && (
                          <p className="mt-2 text-xs leading-5 text-muted">
                            {t("suggestionHelper.whySuggested", {
                              reasons: matchReasons.join(", "),
                            })}
                          </p>
                        )}
                        <button
                          aria-label={t("suggestionHelper.showInfo")}
                          aria-pressed={selectedSuggestionPlaceId === suggestion.placeId}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-on-surface hover:border-brand"
                          onClick={() => onSuggestionSelect(suggestion)}
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-5 place-items-center rounded-full border border-current text-xs"
                          >
                            i
                          </span>
                          {t("suggestionHelper.showInfo")}
                        </button>
                        <button
                          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-on-surface hover:border-brand"
                          onClick={() => handleMoreLikeThis(suggestion)}
                          type="button"
                        >
                          {t("suggestionHelper.moreLikeThis")}
                        </button>
                        <button
                          className="mt-2 w-full rounded-lg bg-brand-surface px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
                          disabled={
                            addedPlaceIds.has(suggestion.placeId) ||
                            isAdding !== null ||
                            pendingSuggestion !== null
                          }
                          onClick={() => handleSelectSuggestion(suggestion)}
                          type="button"
                        >
                          {addedPlaceIds.has(suggestion.placeId)
                            ? t("suggestionHelper.added")
                            : isAdding === suggestion.placeId
                              ? t("common.saving")
                              : t("suggestionHelper.add")}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
