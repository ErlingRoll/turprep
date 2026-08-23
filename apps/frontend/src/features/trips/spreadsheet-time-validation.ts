import type { ItineraryRow } from "./spreadsheet-types"
import { getItineraryRowKey } from "./spreadsheet-drag"

function getTimeMinutes(value: string) {
  const [hoursText, minutesText] = value.split(":")
  const hours = Number(hoursText)
  const minutes = Number(minutesText)

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  return hours * 60 + minutes
}

function formatTimeMinutes(totalMinutes: number) {
  const clampedMinutes = Math.max(0, Math.min(23 * 60 + 59, totalMinutes))
  const hours = Math.floor(clampedMinutes / 60)
  const minutes = clampedMinutes % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function getTimedAnchor(row: ItineraryRow) {
  if (row.item.allDay) {
    return null
  }

  return row.item.startTime ?? row.item.endTime
}

function getTimedWindow(row: ItineraryRow) {
  if (row.item.allDay) {
    return null
  }

  const start = row.item.startTime ?? row.item.endTime
  const end = row.item.endTime ?? row.item.startTime

  if (!start || !end) {
    return null
  }

  return { end, start }
}

function getNextTimedStartAfter(
  rows: ItineraryRow[],
  rowKey: string | null,
  startMinutes: number,
) {
  let nextStartMinutes: number | null = null

  for (const row of rows) {
    if (rowKey !== null && getItineraryRowKey(row) === rowKey) {
      continue
    }

    const anchor = getTimedAnchor(row)
    if (!anchor) {
      continue
    }

    const anchorMinutes = getTimeMinutes(anchor)
    if (anchorMinutes === null || anchorMinutes < startMinutes) {
      continue
    }

    if (nextStartMinutes === null || anchorMinutes < nextStartMinutes) {
      nextStartMinutes = anchorMinutes
    }
  }

  return nextStartMinutes
}

export function getDefaultEndTimeForStart(
  rows: ItineraryRow[],
  startTime: string,
  rowKey: string | null = null,
) {
  const startMinutes = getTimeMinutes(startTime)
  if (startMinutes === null) {
    return null
  }

  const nextStartMinutes = getNextTimedStartAfter(rows, rowKey, startMinutes)
  const defaultEndMinutes = Math.min(startMinutes + 120, 23 * 60 + 59)
  const nearestValidEndMinutes =
    nextStartMinutes === null ? defaultEndMinutes : Math.min(defaultEndMinutes, nextStartMinutes)

  return formatTimeMinutes(Math.max(startMinutes, nearestValidEndMinutes))
}

function sortRowsChronologically(rows: ItineraryRow[]) {
  return [...rows]
    .map((row, index) => ({ index, row }))
    .sort((left, right) => {
      const leftAnchor = getTimedAnchor(left.row)
      const rightAnchor = getTimedAnchor(right.row)

      if (leftAnchor && rightAnchor) {
        return leftAnchor === rightAnchor
          ? left.index - right.index
          : leftAnchor.localeCompare(rightAnchor)
      }
      if (leftAnchor) {
        return -1
      }
      if (rightAnchor) {
        return 1
      }

      return left.index - right.index
    })
    .map((entry) => entry.row)
}

export function getUpdatedRowTimeDraft(
  row: ItineraryRow,
  draft: { allDay: boolean; startTime: string; endTime: string },
): ItineraryRow {
  return {
    ...row,
    item: {
      ...row.item,
      allDay: draft.allDay,
      endTime: draft.allDay ? null : draft.endTime || null,
      startTime: draft.allDay ? null : draft.startTime || null,
    },
  }
}

export function applyDefaultEndTimeForStartEdit<T extends { allDay: boolean; endTime: string; startTime: string }>(
  rows: ItineraryRow[],
  rowKey: string,
  draft: T,
) {
  if (draft.allDay || !draft.startTime || draft.endTime) {
    return draft
  }

  const editedIndex = rows.findIndex((row) => getItineraryRowKey(row) === rowKey)
  if (editedIndex < 0) {
    return draft
  }

  const startMinutes = getTimeMinutes(draft.startTime)
  if (startMinutes === null) {
    return draft
  }

  const defaultEndTime = getDefaultEndTimeForStart(rows, draft.startTime, rowKey)

  return {
    ...draft,
    endTime: defaultEndTime ?? draft.endTime,
  }
}

export function hasValidTimedOrder(
  rows: ItineraryRow[],
  rowKey: string,
  draft: { allDay: boolean; startTime: string; endTime: string },
) {
  const updatedRows = rows.map((row) =>
    getItineraryRowKey(row) === rowKey ? getUpdatedRowTimeDraft(row, draft) : row,
  )

  let previousAnchor: string | null = null
  for (const row of updatedRows) {
    const anchor = getTimedAnchor(row)

    if (anchor === null) {
      continue
    }

    if (previousAnchor !== null && anchor < previousAnchor) {
      return false
    }

    previousAnchor = anchor
  }

  return true
}

export function getTimeOrderValidationError(
  rows: ItineraryRow[],
  rowKey: string,
  draft: { allDay: boolean; startTime: string; endTime: string },
) {
  const updatedRows = rows.map((row) =>
    getItineraryRowKey(row) === rowKey ? getUpdatedRowTimeDraft(row, draft) : row,
  )
  const editedIndex = updatedRows.findIndex((row) => getItineraryRowKey(row) === rowKey)

  if (editedIndex < 0) {
    return null
  }

  const editedWindow = getTimedWindow(updatedRows[editedIndex])
  if (!editedWindow) {
    return null
  }

  if (editedWindow.end < editedWindow.start) {
    return "spreadsheet.endBeforeStartError"
  }

  const timedRows = updatedRows
    .map((row, index) => ({ index, key: getItineraryRowKey(row), window: getTimedWindow(row) }))
    .filter(
      (entry): entry is { index: number; key: string; window: { end: string; start: string } } =>
        entry.window !== null,
    )
    .sort((left, right) =>
      left.window.start === right.window.start
        ? left.index - right.index
        : left.window.start.localeCompare(right.window.start),
    )
  const sortedEditedIndex = timedRows.findIndex((entry) => entry.key === rowKey)
  if (sortedEditedIndex < 0) {
    return null
  }

  const previousWindow = timedRows[sortedEditedIndex - 1]?.window ?? null
  const nextWindow = timedRows[sortedEditedIndex + 1]?.window ?? null

  if (previousWindow && editedWindow.start < previousWindow.end) {
    return "spreadsheet.startBeforePreviousEndError"
  }

  if (nextWindow && editedWindow.end > nextWindow.start) {
    return "spreadsheet.endAfterNextStartError"
  }

  return null
}

export function getTimeEditSortOrder(
  rows: ItineraryRow[],
  rowKey: string,
  draft: { allDay: boolean; startTime: string; endTime: string },
) {
  const currentIndex = rows.findIndex((row) => getItineraryRowKey(row) === rowKey)
  if (currentIndex < 0) {
    return null
  }

  const currentRow = rows[currentIndex]
  if (!currentRow.item.allDay && draft.allDay) {
    return currentIndex
  }

  const sortedRows = sortRowsChronologically(
    rows.map((row) => (getItineraryRowKey(row) === rowKey ? getUpdatedRowTimeDraft(row, draft) : row)),
  )
  const nextIndex = sortedRows.findIndex((row) => getItineraryRowKey(row) === rowKey)

  return nextIndex < 0 ? null : nextIndex
}

export function getRowsForTimeEdit(
  rows: ItineraryRow[],
  rowKey: string,
  draft: { allDay: boolean; startTime: string; endTime: string },
) {
  const currentIndex = rows.findIndex((row) => getItineraryRowKey(row) === rowKey)
  if (currentIndex < 0) {
    return rows
  }

  const updatedRows = rows.map((row) =>
    getItineraryRowKey(row) === rowKey ? getUpdatedRowTimeDraft(row, draft) : row,
  )
  const targetIndex = getTimeEditSortOrder(rows, rowKey, draft)

  if (targetIndex === null || targetIndex === currentIndex) {
    return updatedRows
  }

  const reorderedRows = [...updatedRows]
  const [editedRow] = reorderedRows.splice(currentIndex, 1)
  reorderedRows.splice(targetIndex, 0, editedRow)
  return reorderedRows
}
