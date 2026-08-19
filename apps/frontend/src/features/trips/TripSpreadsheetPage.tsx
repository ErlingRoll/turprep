import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { Activity, HousingStay, Meal, TripDetail } from "../../api"
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

function HousingTable({
  currenciesVisible,
  googleMapsLabel,
  stays,
  websiteVisible,
}: {
  currenciesVisible: boolean
  googleMapsLabel: string
  stays: HousingStay[]
  websiteVisible: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-card bg-surface">
      <table className="mx-auto w-max min-w-[52rem] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-32" />
          <col className="w-48" />
          {currenciesVisible && (
            <>
              <col className="w-16" />
              <col className="w-16" />
            </>
          )}
          {websiteVisible && <col className="w-32" />}
        </colgroup>
        <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <SpreadsheetHeaderCell>{t("spreadsheet.name")}</SpreadsheetHeaderCell>
            <SpreadsheetHeaderCell>{t("spreadsheet.checkIn")}</SpreadsheetHeaderCell>
            <SpreadsheetHeaderCell>{t("spreadsheet.checkOut")}</SpreadsheetHeaderCell>
            <SpreadsheetHeaderCell>{t("spreadsheet.googleMaps")}</SpreadsheetHeaderCell>
            <SpreadsheetHeaderCell>{t("spreadsheet.notes")}</SpreadsheetHeaderCell>
            {currenciesVisible && (
              <>
                <SpreadsheetHeaderCell>{t("spreadsheet.price")}</SpreadsheetHeaderCell>
                <SpreadsheetHeaderCell>{t("spreadsheet.currency")}</SpreadsheetHeaderCell>
              </>
            )}
            {websiteVisible && (
              <SpreadsheetHeaderCell>{t("spreadsheet.website")}</SpreadsheetHeaderCell>
            )}
          </tr>
        </thead>
        <tbody>
          {stays.map((stay) => (
            <tr className="hover:bg-surface-soft" key={stay.id}>
              <SpreadsheetCell>{stay.name}</SpreadsheetCell>
              <SpreadsheetCell>
                {stay.checkIn ? formatLongDate(stay.checkIn) : null}
              </SpreadsheetCell>
              <SpreadsheetCell>
                {stay.checkOut ? formatLongDate(stay.checkOut) : null}
              </SpreadsheetCell>
              <LinkCell href={stay.googleMapsUrl} label={googleMapsLabel} />
              <SpreadsheetCell>
                <span className="block max-w-64 whitespace-pre-wrap break-words">{stay.notes}</span>
              </SpreadsheetCell>
              {currenciesVisible && (
                <>
                  <SpreadsheetCell>{stay.priceAmount}</SpreadsheetCell>
                  <SpreadsheetCell>{stay.priceCurrency}</SpreadsheetCell>
                </>
              )}
              {websiteVisible && <SpreadsheetCell>{stay.website}</SpreadsheetCell>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TripSpreadsheetPage({ trip, showDetails }: TripSpreadsheetPageProps) {
  const { t } = useTranslation()
  const showPrice = showDetails && trip.itemDetailVisibility.showPrice
  const showWebsite = showDetails && trip.itemDetailVisibility.showWebsite
  const housingStays = trip.housingStays.filter((stay) => !stay.isBackup)

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

        <div className="relative left-1/2 mt-5 w-screen -translate-x-1/2 px-5 sm:px-8">
          <div className="mx-auto w-fit rounded-2xl border border-border-card bg-surface">
            <table className="mx-auto w-max min-w-[68rem] table-fixed border-collapse text-left">
              <colgroup>
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
                {trip.days.map((day) => {
                  const rows = getItineraryRows(trip, day.date)

                  return (
                    <Fragment key={day.date}>
                      <tr className="bg-page">
                        <th
                          className="border-y border-border-divider px-3 py-2 text-left text-sm font-semibold text-brand"
                          colSpan={7 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)}
                        >
                          {formatLongDate(day.date)}
                          {day.title?.trim() ? ` · ${day.title}` : ""}
                        </th>
                      </tr>
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            className="border-b border-border-divider px-3 py-2 text-sm text-muted"
                            colSpan={7 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)}
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

        <div className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-brand">{t("spreadsheet.housing")}</h2>
              <p className="mt-2 text-sm text-muted">{t("spreadsheet.housingDescription")}</p>
            </div>
            <p className="text-sm text-muted">
              {t("spreadsheet.rows", { count: housingStays.length })}
            </p>
          </div>
          <div className="mt-4">
            {housingStays.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border-dashed p-5 text-sm text-muted">
                {t("spreadsheet.noHousing")}
              </p>
            ) : (
              <HousingTable
                currenciesVisible={showPrice}
                googleMapsLabel={t("tripDetails.openGoogleMaps")}
                stays={housingStays}
                websiteVisible={showWebsite}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
