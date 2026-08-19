import type { Activity, HousingStay, Meal } from "../../api"

export type HousingDraft = {
  checkIn: string
  checkOut: string
  googleMapsUrl: string
  name: string
  notes: string
  priceAmount: string
  priceCurrency: string
  website: string
}

export type ItemDraft = {
  allDay: boolean
  endTime: string
  notes: string
  startTime: string
  title: string
}

export type EditableField = "endTime" | "notes" | "startTime" | "title"
export type HousingEditableField = "checkIn" | "checkOut" | "name" | "notes" | "price" | "website"

export type ItineraryRow = {
  item: Activity | Meal
  type: "activity" | "meal"
}

export type SpreadsheetDraggedItem = {
  dayDate: string
  itemId: string
  itemType: ItineraryRow["type"]
}

export type SpreadsheetDropTarget = {
  dayDate: string
  index: number
  lineY: number
}

export type SpreadsheetPendingDeletion =
  | { housing: HousingStay }
  | { item: Activity | Meal; type: ItineraryRow["type"] }
