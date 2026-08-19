import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { Activity, Meal, TripDetail } from "../../api"
import { GoogleMapsLinkButton } from "../../components/GoogleMapsLinkButton"
import { getDayItemTitle, sortDayItems } from "../../lib/activity-format"
import { formatLongDate } from "../../lib/date-format"
import { isAllowedGoogleMapsUrl } from "@turprep/models"

type TripSpreadsheetPageProps = {
  trip: TripDetail
  showDetails: boolean
}

type ItineraryRow = {
  item: Activity | Meal
  type: "activity" | "meal"
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

export function TripSpreadsheetPage({ trip, showDetails }: TripSpreadsheetPageProps) {
  const { t } = useTranslation()
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
                        rows.map(({ item, type }) => (
                          <tr className="hover:bg-surface-soft" key={`${type}:${item.id}`}>
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
                              {getDayItemTitle(item, t("tripDetails.untitledItem"))}
                            </SpreadsheetCell>
                            <SpreadsheetCell>{item.startTime}</SpreadsheetCell>
                            <SpreadsheetCell>{item.endTime}</SpreadsheetCell>
                            <LinkCell
                              href={item.googleMapsUrl}
                              label={t("tripDetails.openGoogleMaps")}
                            />
                            <SpreadsheetCell>
                              <span className="block max-w-64 whitespace-pre-wrap break-words">
                                {item.notes}
                              </span>
                            </SpreadsheetCell>
                            {showPrice && (
                              <>
                                <SpreadsheetCell>{item.priceAmount}</SpreadsheetCell>
                                <SpreadsheetCell>{item.priceCurrency}</SpreadsheetCell>
                              </>
                            )}
                            {showWebsite && <SpreadsheetCell>{item.website}</SpreadsheetCell>}
                          </tr>
                        ))
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
