import type { DragEvent, Dispatch, SetStateAction } from "react"
import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import type { Activity, Meal, TripDetail } from "../../api"
import { TimePicker } from "../../components/TimePicker"
import {
  TripItemPreference,
  TripItemPreferenceDistribution,
} from "../../components/TripItemPreference"
import { formatDate } from "../../lib/date-format"
import { getDayItemTitle } from "../../lib/activity-format"
import type { TripItemPreferenceValue, TripItemType } from "@turprep/models"
import { SpreadsheetCell } from "./SpreadsheetCell"
import { SpreadsheetItemActions } from "./SpreadsheetItemActions"
import type { EditableField, ItemDraft, ItineraryRow } from "./spreadsheet-types"

type SpreadsheetItineraryRowProps = {
  item: Activity | Meal
  type: ItineraryRow["type"]
  dayDate: string
  itemIndex: number
  draft: ItemDraft | null
  activeField: EditableField | null
  isSaving: boolean
  saveError: string | null
  showPrice: boolean
  showWebsite: boolean
  isHousingEditing: boolean
  savingPreferenceKey: string | null
  userId: string
  preferences: TripDetail["preferences"]
  itineraryColumnCount: number
  onStartEditing: (
    type: ItineraryRow["type"],
    item: Activity | Meal,
    field: EditableField,
  ) => void
  onUpdateDraft: Dispatch<SetStateAction<ItemDraft | null>>
  onSaveField: (
    type: ItineraryRow["type"],
    item: Activity | Meal,
    field: EditableField,
  ) => void
  onCancelEditing: () => void
  onSetPendingDeletion: (deletion: {
    item: Activity | Meal
    type: ItineraryRow["type"]
  }) => void
  onSaveGoogleMapsUrl: (
    type: ItineraryRow["type"],
    item: Activity | Meal,
    url: string | null,
  ) => Promise<string | null>
  onMoveToBackup: (type: ItineraryRow["type"], item: Activity | Meal) => void
  onOpenMap: (type: "activity" | "meal", itemId: string) => void
  onPreferenceChange: (
    itemType: TripItemType,
    itemId: string,
    value: TripItemPreferenceValue | null,
  ) => void
  onDragStart: (
    event: DragEvent<HTMLTableRowElement>,
    dayDate: string,
    row: ItineraryRow,
  ) => void
  onDragOver: (event: DragEvent<HTMLTableRowElement>, dayDate: string) => void
  onDragEnd: () => void
  onDrop: (event: DragEvent<HTMLTableRowElement>) => Promise<void>
}

export function SpreadsheetItineraryRow({
  item,
  type,
  dayDate,
  itemIndex,
  draft,
  activeField,
  isSaving,
  saveError,
  showPrice,
  showWebsite,
  isHousingEditing,
  savingPreferenceKey,
  userId,
  preferences,
  itineraryColumnCount,
  onStartEditing,
  onUpdateDraft,
  onSaveField,
  onCancelEditing,
  onSetPendingDeletion,
  onSaveGoogleMapsUrl,
  onMoveToBackup,
  onOpenMap,
  onPreferenceChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: SpreadsheetItineraryRowProps) {
  const { t } = useTranslation()
  const innerColumnCount = 5 + (showPrice ? 2 : 0) + (showWebsite ? 1 : 0)

  function renderActions(field: EditableField) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-brand-surface px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-50"
          disabled={isSaving}
          onClick={() => onSaveField(type, item, field)}
          type="button"
        >
          {isSaving ? t("common.saving") : t("common.save")}
        </button>
        <button
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-on-surface disabled:opacity-50"
          disabled={isSaving}
          onClick={onCancelEditing}
          type="button"
        >
          {t("common.cancel")}
        </button>
        {saveError && (
          <p className="basis-full text-xs text-error">{saveError}</p>
        )}
      </div>
    )
  }

  return (
    <Fragment>
      <tr
        className="group bg-surface hover:bg-surface-soft"
        data-drop-day={dayDate}
        data-drop-item-index={itemIndex}
        draggable={!activeField && !isHousingEditing}
        onDragOver={(event) => onDragOver(event, dayDate)}
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, dayDate, { item, type })}
        onDrop={(event) => void onDrop(event)}
      >
        <td
          className="relative border-b-0 p-0"
          colSpan={itineraryColumnCount}
        >
          <table className="min-w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-30" />
              <col className="w-56" />
              <col className="w-16" />
              <col className="w-16" />
              {showPrice && (
                <>
                  <col className="w-16" />
                  <col className="w-16" />
                </>
              )}
              {showWebsite && <col className="w-32" />}
              <col />
            </colgroup>
            <tbody>
              <tr className="group-hover:bg-surface-soft">
                <SpreadsheetCell className="border-b-0 text-base font-semibold text-brand">
                  {formatDate(item.tripDate ?? dayDate)}
                </SpreadsheetCell>
                <SpreadsheetCell className="border-b-0 text-base font-semibold">
                  {activeField === "title" && draft ? (
                    <>
                      <input
                        aria-label={t("spreadsheet.title")}
                        autoFocus
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                        onChange={(event) =>
                          onUpdateDraft((current) =>
                            current ? { ...current, title: event.target.value } : current,
                          )
                        }
                        value={draft.title}
                      />
                      {renderActions("title")}
                    </>
                  ) : (
                    <button
                      className={`w-full cursor-text text-left text-on-surface underline decoration-2 underline-offset-4 transition hover:text-brand ${
                        type === "activity"
                          ? "decoration-type-activity"
                          : "decoration-type-meal"
                      }`}
                      onClick={() => onStartEditing(type, item, "title")}
                      type="button"
                    >
                      {getDayItemTitle(item, t("tripDetails.untitledItem"))}
                    </button>
                  )}
                </SpreadsheetCell>
                <SpreadsheetCell className="border-b-0">
                  {activeField === "startTime" && draft ? (
                    <>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input
                          checked={draft.allDay}
                          onChange={(event) =>
                            onUpdateDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    allDay: event.target.checked,
                                  }
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
                              onUpdateDraft((current) =>
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
                      onClick={() => onStartEditing(type, item, "startTime")}
                      type="button"
                    >
                      {item.allDay ? t("spreadsheet.allDay") : item.startTime}
                    </button>
                  )}
                </SpreadsheetCell>
                <SpreadsheetCell className="border-b-0">
                  {activeField === "endTime" && draft ? (
                    <>
                      {!draft.allDay && (
                        <TimePicker
                          label={t("spreadsheet.end")}
                          onChange={(value) =>
                            onUpdateDraft((current) =>
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
                      onClick={() => onStartEditing(type, item, "endTime")}
                      type="button"
                    >
                      {item.allDay ? t("spreadsheet.allDay") : item.endTime}
                    </button>
                  )}
                </SpreadsheetCell>
                {showPrice && (
                  <>
                    <SpreadsheetCell className="border-b-0">
                      {item.priceAmount}
                    </SpreadsheetCell>
                    <SpreadsheetCell className="border-b-0">
                      {item.priceCurrency}
                    </SpreadsheetCell>
                  </>
                )}
                {showWebsite && (
                  <SpreadsheetCell className="border-b-0">
                    {item.website}
                  </SpreadsheetCell>
                )}
                <SpreadsheetCell className="border-b-0">
                  <div className="flex items-start justify-end gap-2 pr-2">
                    <TripItemPreference
                      compact
                      disabled={savingPreferenceKey === `${type}:${item.id}`}
                      itemId={item.id}
                      itemType={type}
                      onChange={(value) => onPreferenceChange(type, item.id, value)}
                      preferences={preferences}
                      userId={userId}
                    />
                    <SpreadsheetItemActions
                      isBusy={isSaving}
                      item={item}
                      onChangeGoogleMapsUrl={(url) => onSaveGoogleMapsUrl(type, item, url)}
                      onDelete={() => onSetPendingDeletion({ item, type })}
                      onMoveToBackup={() => onMoveToBackup(type, item)}
                      onOpenMap={() => onOpenMap(type, item.id)}
                    />
                  </div>
                </SpreadsheetCell>
              </tr>
              <tr className="group-hover:bg-surface-soft">
                <td
                  className="border-b border-border-divider px-3 pb-2 pt-0 text-sm"
                  colSpan={innerColumnCount}
                >
                  {activeField === "notes" && draft ? (
                    <>
                      <textarea
                        aria-label={t("spreadsheet.notes")}
                        autoFocus
                        className="min-h-20 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-on-surface outline-none focus:border-brand"
                        onChange={(event) =>
                          onUpdateDraft((current) =>
                            current ? { ...current, notes: event.target.value } : current,
                          )
                        }
                        value={draft.notes}
                      />
                      {renderActions("notes")}
                    </>
                  ) : (
                    <button
                      aria-label={t("spreadsheet.notes")}
                      className={`inline-block max-w-full min-h-5 cursor-text whitespace-pre-wrap break-words text-left transition hover:text-brand ${
                        item.notes?.trim() ? "text-on-surface" : "text-muted"
                      }`}
                      onClick={() => onStartEditing(type, item, "notes")}
                      type="button"
                    >
                      {item.notes?.trim() ? item.notes : t("spreadsheet.addNote")}
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="pointer-events-none absolute inset-y-0 right-0">
            <TripItemPreferenceDistribution
              itemId={item.id}
              itemType={type}
              orientation="vertical"
              preferences={preferences}
            />
          </div>
        </td>
      </tr>
    </Fragment>
  )
}
