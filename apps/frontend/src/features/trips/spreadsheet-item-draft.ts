import type { Activity, Meal } from "../../api"
import type { ItemDraft } from "./spreadsheet-types"

export function getSpreadsheetItemDraft(item: Activity | Meal): ItemDraft {
  return {
    allDay: item.allDay,
    endTime: item.endTime ?? "",
    notes: item.notes ?? "",
    startTime: item.startTime ?? "",
    title: item.title ?? item.placeName ?? "",
  }
}
