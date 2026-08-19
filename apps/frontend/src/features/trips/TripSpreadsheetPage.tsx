import { Fragment, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { updateActivity, updateMeal, type Activity, type Meal, type TripDetail } from "../../api"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { TimePicker } from "../../components/TimePicker"
import { getDayItemTitle, sortDayItems } from "../../lib/activity-format"
import { formatLongDate } from "../../lib/date-format"
import { getErrorMessage } from "../../lib/errors"
import { isAllowedGoogleMapsUrl } from "@turprep/models"
import { replaceActivityInTrip, replaceMealInTrip } from "./trip-state"

type TripSpreadsheetPageProps = {
  accessToken: string
  onTripUpdated: (trip: TripDetail) => void
  trip: TripDetail
  showDetails: boolean
}

type ItineraryRow = {
  item: Activity | Meal
  type: "activity" | "meal"
}

type ItemDraft = {
  allDay: boolean
  endTime: string
  notes: string
  startTime: string
  title: string
}

type EditableField = "endTime" | "notes" | "startTime" | "title"

function getItemDraft(item: Activity | Meal): ItemDraft {
  return {
    allDay: item.allDay,
    endTime: item.endTime ?? "",
    notes: item.notes ?? "",
    startTime: item.startTime ?? "",
    title: item.title ?? item.placeName ?? "",
  }
}

function getItineraryRows(trip: TripDetail, date: string): ItineraryRow[] {
  const day = trip.days.find((currentDay) => currentDay.date === date)
  const meals = trip.meals.filter((meal) => !meal.isBackup && meal.tripDate === date)
  const activityIds = new Set(day?.activities.map((activity) => activity.id))

  return sortDayItems([...(day?.activities ?? []), ...meals]).map((item) => ({
    item,
    type: activityIds.has(item.id) ? "activity" : "meal",
  }))
}

function SpreadsheetCell({ children }: { children: ReactNode }) {
  return <td className="border-b border-border-divider px-3 py-2 align-top text-sm">{children}</td>
}

function SpreadsheetHeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-border-divider bg-surface-muted px-3 py-2 first:rounded-tl-2xl last:rounded-tr-2xl">
      {children}
    </th>
  )
}

function LinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href || !isAllowedGoogleMapsUrl(href)) {
    return <SpreadsheetCell>{null}</SpreadsheetCell>
  }

  return (
    <SpreadsheetCell>
      <GoogleMapsLinkButton href={href} label={label} />
    </SpreadsheetCell>
  )
}

export function TripSpreadsheetPage({
  accessToken,
  onTripUpdated,
  trip,
  showDetails,
}: TripSpreadsheetPageProps) {
  const { t } = useTranslation()
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const showPrice = showDetails && trip.itemDetailVisibility.showPrice
  const showWebsite = showDetails && trip.itemDetailVisibility.showWebsite
  const housingStays = trip.housingStays.filter((stay) => !stay.isBackup)
  const itineraryRows = trip.days.map((day) => ({
    day,
    rows: getItineraryRows(trip, day.date),
  }))
  const housingByDay = trip.days.map((day) =>
    housingStays.find(
      (stay) =>
        stay.checkIn !== null &&
        stay.checkOut !== null &&
        stay.checkIn <= day.date &&
        day.date < stay.checkOut,
    ),
  )
  const rowCounts = itineraryRows.map(({ rows }) => 1 + Math.max(rows.length, 1))
  const getHousingRowSpan = (startIndex: number) => {
    const housingId = housingByDay[startIndex]?.id ?? null
    let endIndex = startIndex

    while (endIndex < rowCounts.length && (housingByDay[endIndex]?.id ?? null) === housingId) {
      endIndex += 1
    }

    return rowCounts.slice(startIndex, endIndex).reduce((total, count) => total + count, 0)
  }
  const itineraryColumnCount = 7 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)

  function startEditing(type: ItineraryRow["type"], item: Activity | Meal, field: EditableField) {
    if (isSaving) {
      return
    }

    setEditingFieldKey(`${type}:${item.id}:${field}`)
    setDraft(getItemDraft(item))
    setSaveError(null)
  }

  function cancelEditing() {
    if (isSaving) {
      return
    }

    setEditingFieldKey(null)
    setDraft(null)
    setSaveError(null)
  }

  async function saveEditingField(
    type: ItineraryRow["type"],
    item: Activity | Meal,
    field: EditableField,
  ) {
    if (!draft || editingFieldKey !== `${type}:${item.id}:${field}`) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    const input =
      field === "title"
        ? { title: draft.title.trim() || null }
        : field === "notes"
          ? { notes: draft.notes.trim() || null }
          : {
              allDay: draft.allDay,
              endTime: draft.allDay ? null : draft.endTime || null,
              startTime: draft.allDay ? null : draft.startTime || null,
            }

    try {
      if (type === "meal") {
        const savedMeal = await updateMeal(accessToken, trip.id, item.id, input)
        onTripUpdated(replaceMealInTrip(trip, savedMeal))
      } else {
        const savedActivity = await updateActivity(accessToken, trip.id, item.id, input)
        onTripUpdated(replaceActivityInTrip(trip, savedActivity))
      }

      setEditingFieldKey(null)
      setDraft(null)
    } catch (reason: unknown) {
      setSaveError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-border-card bg-surface-soft p-4 lg:hidden">
        <p className="font-semibold text-brand">{t("spreadsheet.desktopOnlyTitle")}</p>
        <p className="mt-2 text-sm text-muted">{t("spreadsheet.desktopOnlyDescription")}</p>
      </div>

      <div className="hidden lg:block">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-text">
              {t("spreadsheet.prototype")}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-brand">{t("spreadsheet.itinerary")}</h2>
            <p className="mt-2 text-sm text-muted">{t("spreadsheet.readOnlyDescription")}</p>
          </div>
          <p className="text-sm text-muted">
            {t("spreadsheet.tripDates", {
              start: formatLongDate(trip.startDate),
              end: formatLongDate(trip.endDate),
            })}
          </p>
        </div>

        <div className="relative left-1/2 mt-5 w-screen -translate-x-1/2 px-2">
          <div className="mx-auto w-fit rounded-2xl border border-border-card bg-surface">
            <table className="mx-auto w-max min-w-[83rem] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-52" />
                <col className="w-30" />
                <col className="w-26" />
                <col className="w-48" />
                <col className="w-16" />
                <col className="w-16" />
                <col className="w-32" />
                <col className="w-48" />
                {showPrice && (
                  <>
                    <col className="w-16" />
                    <col className="w-16" />
                  </>
                )}
                {showWebsite && <col className="w-32" />}
              </colgroup>
              <thead className="sticky top-0 z-10 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <SpreadsheetHeaderCell>{t("spreadsheet.housing")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.date")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.type")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.title")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.start")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.end")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.googleMaps")}</SpreadsheetHeaderCell>
                  <SpreadsheetHeaderCell>{t("spreadsheet.notes")}</SpreadsheetHeaderCell>
                  {showPrice && (
                    <>
                      <SpreadsheetHeaderCell>{t("spreadsheet.price")}</SpreadsheetHeaderCell>
                      <SpreadsheetHeaderCell>{t("spreadsheet.currency")}</SpreadsheetHeaderCell>
                    </>
                  )}
                  {showWebsite && (
                    <SpreadsheetHeaderCell>{t("spreadsheet.website")}</SpreadsheetHeaderCell>
                  )}
                </tr>
              </thead>
              <tbody>
                {itineraryRows.map(({ day, rows }, dayIndex) => {
                  const housing = housingByDay[dayIndex]
                  const housingId = housing?.id ?? null
                  const previousHousingId = housingByDay[dayIndex - 1]?.id ?? null
                  const startsHousingBlock = dayIndex === 0 || housingId !== previousHousingId

                  return (
                    <Fragment key={day.date}>
                      <tr className="bg-page">
                        {startsHousingBlock && (
                          <td
                            className="border-b border-r border-border-divider bg-surface-soft p-3 align-top"
                            rowSpan={getHousingRowSpan(dayIndex)}
                          >
                            {housing ? (
                              <div className="space-y-2">
                                <p className="font-semibold leading-tight text-brand">
                                  {housing.name}
                                </p>
                                {housing.checkIn && housing.checkOut && (
                                  <p className="text-xs text-muted">
                                    {formatLongDate(housing.checkIn)} –{" "}
                                    {formatLongDate(housing.checkOut)}
                                  </p>
                                )}
                                {housing.googleMapsUrl &&
                                  isAllowedGoogleMapsUrl(housing.googleMapsUrl) && (
                                    <GoogleMapsLinkButton
                                      href={housing.googleMapsUrl}
                                      label={t("tripDetails.openGoogleMaps")}
                                    />
                                  )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted">
                                {t("spreadsheet.noHousing")}
                              </span>
                            )}
                          </td>
                        )}
                        <th
                          className="border-y border-border-divider px-3 py-2 text-left text-sm font-semibold text-brand"
                          colSpan={itineraryColumnCount}
                        >
                          {formatLongDate(day.date)}
                          {day.title?.trim() ? ` · ${day.title}` : ""}
                        </th>
                      </tr>
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            className="border-b border-border-divider px-3 py-2 text-sm text-muted"
                            colSpan={itineraryColumnCount}
                          >
                            {t("spreadsheet.noItems")}
                          </td>
                        </tr>
                      ) : (
                        rows.map(({ item, type }) => {
                          const itemKey = `${type}:${item.id}`
                          const activeField = editingFieldKey?.startsWith(`${itemKey}:`)
                            ? (editingFieldKey.slice(itemKey.length + 1) as EditableField)
                            : null
                          const renderActions = (field: EditableField) => (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() => void saveEditingField(type, item, field)}
                                type="button"
                              >
                                {isSaving ? t("common.saving") : t("common.save")}
                              </button>
                              <button
                                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
                                disabled={isSaving}
                                onClick={cancelEditing}
                                type="button"
                              >
                                {t("common.cancel")}
                              </button>
                              {saveError && (
                                <p className="basis-full text-xs text-error">{saveError}</p>
                              )}
                            </div>
                          )

                          return (
                            <tr className="hover:bg-surface-soft" key={itemKey}>
                              <SpreadsheetCell>
                                {formatLongDate(item.tripDate ?? day.date)}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className={`size-2.5 rounded-full ${
                                      type === "activity" ? "bg-type-activity" : "bg-type-meal"
                                    }`}
                                  />
                                  {type === "activity"
                                    ? t("spreadsheet.activity")
                                    : t("spreadsheet.meal")}
                                </span>
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "title" && draft ? (
                                  <>
                                    <input
                                      aria-label={t("spreadsheet.title")}
                                      autoFocus
                                      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setDraft((current) =>
                                          current
                                            ? { ...current, title: event.target.value }
                                            : current,
                                        )
                                      }
                                      value={draft.title}
                                    />
                                    {renderActions("title")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "title")}
                                    type="button"
                                  >
                                    {getDayItemTitle(item, t("tripDetails.untitledItem"))}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "startTime" && draft ? (
                                  <>
                                    <label className="flex items-center gap-1 text-xs text-muted">
                                      <input
                                        checked={draft.allDay}
                                        onChange={(event) =>
                                          setDraft((current) =>
                                            current
                                              ? { ...current, allDay: event.target.checked }
                                              : current,
                                          )
                                        }
                                        type="checkbox"
                                      />
                                      {t("spreadsheet.allDay")}
                                    </label>
                                    {!draft.allDay && (
                                      <div className="mt-2">
                                        <TimePicker
                                          label={t("spreadsheet.start")}
                                          onChange={(value) =>
                                            setDraft((current) =>
                                              current ? { ...current, startTime: value } : current,
                                            )
                                          }
                                          value={draft.startTime}
                                        />
                                      </div>
                                    )}
                                    {renderActions("startTime")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "startTime")}
                                    type="button"
                                  >
                                    {item.allDay ? t("spreadsheet.allDay") : item.startTime}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <SpreadsheetCell>
                                {activeField === "endTime" && draft ? (
                                  <>
                                    {!draft.allDay && (
                                      <TimePicker
                                        label={t("spreadsheet.end")}
                                        onChange={(value) =>
                                          setDraft((current) =>
                                            current ? { ...current, endTime: value } : current,
                                          )
                                        }
                                        value={draft.endTime}
                                      />
                                    )}
                                    {renderActions("endTime")}
                                  </>
                                ) : (
                                  <button
                                    className="w-full cursor-text text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "endTime")}
                                    type="button"
                                  >
                                    {item.allDay ? t("spreadsheet.allDay") : item.endTime}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              <LinkCell
                                href={item.googleMapsUrl}
                                label={t("tripDetails.openGoogleMaps")}
                              />
                              <SpreadsheetCell>
                                {activeField === "notes" && draft ? (
                                  <>
                                    <textarea
                                      aria-label={t("spreadsheet.notes")}
                                      autoFocus
                                      className="min-h-20 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                                      onChange={(event) =>
                                        setDraft((current) =>
                                          current
                                            ? { ...current, notes: event.target.value }
                                            : current,
                                        )
                                      }
                                      value={draft.notes}
                                    />
                                    {renderActions("notes")}
                                  </>
                                ) : (
                                  <button
                                    className="block min-h-5 w-full max-w-64 cursor-text whitespace-pre-wrap break-words text-left transition hover:text-brand"
                                    onClick={() => startEditing(type, item, "notes")}
                                    type="button"
                                  >
                                    {item.notes}
                                  </button>
                                )}
                              </SpreadsheetCell>
                              {showPrice && (
                                <>
                                  <SpreadsheetCell>{item.priceAmount}</SpreadsheetCell>
                                  <SpreadsheetCell>{item.priceCurrency}</SpreadsheetCell>
                                </>
                              )}
                              {showWebsite && <SpreadsheetCell>{item.website}</SpreadsheetCell>}
                            </tr>
                          )
                        })
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
