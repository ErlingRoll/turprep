import type { DragEvent } from "react"
import type { ItineraryRow, SpreadsheetDropTarget } from "./spreadsheet-types"

export function getItineraryRowKey(row: ItineraryRow) {
  return `${row.type}:${row.item.id}`
}

export function getDraggedItemKey(item: { itemType: ItineraryRow["type"]; itemId: string }) {
  return `${item.itemType}:${item.itemId}`
}

export function isDragBlockedTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, input, select, textarea, [contenteditable='true']"))
  )
}

export function getNearestSpreadsheetDropTarget(
  table: HTMLTableElement | null,
  dayDate: string,
  clientY: number,
): SpreadsheetDropTarget | null {
  if (!table) {
    return null
  }

  const itemRows = Array.from(
    table.querySelectorAll<HTMLTableRowElement>(`tr[data-drop-day="${dayDate}"][data-drop-item-index]`),
  )

  const landingZones =
    itemRows.length > 0
      ? (() => {
          const rowBounds = itemRows.map((row) => row.getBoundingClientRect())
          return [
            { index: 0, lineY: rowBounds[0].top },
            ...rowBounds.slice(1).map((bounds, index) => ({
              index: index + 1,
              lineY: (rowBounds[index].bottom + bounds.top) / 2,
            })),
            { index: rowBounds.length, lineY: rowBounds.at(-1)?.bottom ?? rowBounds[0].bottom },
          ]
        })()
      : (() => {
          const emptyRow = table.querySelector<HTMLTableRowElement>(`tr[data-drop-empty-day="${dayDate}"]`)
          if (!emptyRow) {
            return []
          }

          const bounds = emptyRow.getBoundingClientRect()
          return [{ index: 0, lineY: bounds.top }]
        })()

  return landingZones.reduce<SpreadsheetDropTarget | null>((nearest, zone) => {
    const candidate = { dayDate, ...zone }
    return !nearest || Math.abs(candidate.lineY - clientY) < Math.abs(nearest.lineY - clientY)
      ? candidate
      : nearest
  }, null)
}

export function setSpreadsheetDragData(
  event: DragEvent<HTMLElement>,
  rowKey: string,
  dragLabel: string,
) {
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", rowKey)

  const dragPreview = document.createElement("div")
  dragPreview.className =
    "pointer-events-none fixed z-50 rounded-lg border border-brand bg-surface px-3 py-2 text-sm font-semibold text-on-surface shadow-lg"
  dragPreview.textContent = dragLabel
  dragPreview.style.left = "-1000px"
  dragPreview.style.top = "-1000px"
  document.body.appendChild(dragPreview)
  event.dataTransfer.setDragImage(dragPreview, 16, 16)
  window.setTimeout(() => dragPreview.remove(), 0)
}
