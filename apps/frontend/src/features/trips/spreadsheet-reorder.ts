import { getTrip, reorderDayItems, type TripDetail } from "../../api"
import { getErrorMessage } from "../../lib/errors"
import { getItineraryRowKey } from "./spreadsheet-drag"
import type { ItineraryRow } from "./spreadsheet-types"

export type SpreadsheetItemTimeUpdate = {
  endTime: string | null
  startTime: string | null
}

export type SpreadsheetReorderResult = {
  finalIndex: number
  movedRow: ItineraryRow
  rowsByGroupId: Map<string, ItineraryRow[]>
  sourceGroupId: string
  sourceIndex: number
  targetGroupId: string
  timeUpdates: Map<string, SpreadsheetItemTimeUpdate>
}

export type SpreadsheetReorderCalculation =
  | SpreadsheetReorderResult
  | { error: "time-range" }
  | null

type CalculateSpreadsheetReorderOptions = {
  draggedKey: string
  sourceGroupId: string
  sourceRows: ItineraryRow[]
  targetGroupId: string
  targetIndex: number
  targetRows: ItineraryRow[]
}

type SpreadsheetReorderQueueOptions = {
  accessToken: string
  groupDates: Map<string, string | null>
  onError: (message: string) => void
  onPendingChange: (isPending: boolean) => void
  onSuccess?: () => void
  onTripUpdated: (trip: TripDetail) => void
  latestTripRef: { current: TripDetail }
  optimisticTrip: TripDetail
  pendingCountRef: { current: number }
  queueRef: { current: Promise<void> }
  reorderGenerationRef: { current: number }
  rowsByGroupId: Map<string, ItineraryRow[]>
  timeUpdates: Map<string, SpreadsheetItemTimeUpdate>
}

function getTimeMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function formatTimeMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function getTimeAnchor(item: ItineraryRow["item"]) {
  if (item.allDay) {
    return null
  }

  return item.startTime ?? item.endTime
}

function rebaseItemTime(
  item: ItineraryRow["item"],
  startTime: string,
): SpreadsheetItemTimeUpdate | null {
  const currentStartTime = getTimeAnchor(item)
  if (!currentStartTime) {
    return null
  }

  if (!item.startTime) {
    return {
      endTime: startTime,
      startTime: null,
    }
  }

  if (!item.endTime) {
    return {
      endTime: null,
      startTime,
    }
  }

  const duration = getTimeMinutes(item.endTime) - getTimeMinutes(item.startTime)
  const endMinutes = getTimeMinutes(startTime) + duration

  if (endMinutes > 23 * 60 + 59) {
    return null
  }

  return {
    endTime: formatTimeMinutes(endMinutes),
    startTime,
  }
}

function getRebasedTimeUpdates(
  sourceRows: ItineraryRow[],
  nextTargetRows: ItineraryRow[],
  sourceIndex: number,
  finalIndex: number,
  isSameGroup: boolean,
) {
  const timeUpdates = new Map<string, SpreadsheetItemTimeUpdate>()

  if (!isSameGroup) {
    const movedRow = nextTargetRows[finalIndex]
    if (movedRow) {
      timeUpdates.set(getItineraryRowKey(movedRow), {
        endTime: null,
        startTime: null,
      })
    }
    return timeUpdates
  }

  const segmentStart = Math.min(sourceIndex, finalIndex)
  const segmentEnd = Math.max(sourceIndex, finalIndex)
  const originalTimedRows = sourceRows
    .slice(segmentStart, segmentEnd + 1)
    .filter((row) => getTimeAnchor(row.item) !== null)
  const reorderedTimedRows = nextTargetRows
    .slice(segmentStart, segmentEnd + 1)
    .filter((row) => getTimeAnchor(row.item) !== null)
  const originalTimeSlots = originalTimedRows
    .map((row) => getTimeAnchor(row.item))
    .filter((time): time is string => time !== null)

  for (const [index, row] of reorderedTimedRows.entries()) {
    const timeUpdate = rebaseItemTime(row.item, originalTimeSlots[index])
    if (!timeUpdate) {
      return null
    }

    timeUpdates.set(getItineraryRowKey(row), timeUpdate)
  }

  return timeUpdates
}

export function calculateSpreadsheetReorder({
  draggedKey,
  sourceGroupId,
  sourceRows,
  targetGroupId,
  targetIndex,
  targetRows,
}: CalculateSpreadsheetReorderOptions): SpreadsheetReorderCalculation {
  const sourceIndex = sourceRows.findIndex((row) => getItineraryRowKey(row) === draggedKey)
  if (sourceIndex < 0) {
    return null
  }

  const isSameGroup = sourceGroupId === targetGroupId
  const targetRowsWithoutDraggedItem = targetRows.filter(
    (row) => getItineraryRowKey(row) !== draggedKey,
  )
  const adjustedTargetIndex =
    isSameGroup && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  const insertionIndex = Math.max(
    0,
    Math.min(adjustedTargetIndex, targetRowsWithoutDraggedItem.length),
  )

  if (isSameGroup && insertionIndex === sourceIndex) {
    return null
  }

  const movedRow = sourceRows[sourceIndex]
  const nextTargetRows = [
    ...targetRowsWithoutDraggedItem.slice(0, insertionIndex),
    movedRow,
    ...targetRowsWithoutDraggedItem.slice(insertionIndex),
  ]
  const timeUpdates = getRebasedTimeUpdates(
    sourceRows,
    nextTargetRows,
    sourceIndex,
    insertionIndex,
    isSameGroup,
  )

  if (timeUpdates === null) {
    return { error: "time-range" }
  }

  const rowsByGroupId = new Map<string, ItineraryRow[]>()
  if (isSameGroup) {
    rowsByGroupId.set(sourceGroupId, nextTargetRows)
  } else {
    rowsByGroupId.set(
      sourceGroupId,
      sourceRows.filter((row) => getItineraryRowKey(row) !== draggedKey),
    )
    rowsByGroupId.set(targetGroupId, nextTargetRows)
  }

  return {
    finalIndex: insertionIndex,
    movedRow,
    rowsByGroupId,
    sourceGroupId,
    sourceIndex,
    targetGroupId,
    timeUpdates,
  }
}

export function getSpreadsheetReorderInput(
  rowsByGroupId: Map<string, ItineraryRow[]>,
  groupDates: Map<string, string | null>,
  timeUpdates: Map<string, SpreadsheetItemTimeUpdate>,
) {
  return Array.from(rowsByGroupId.entries()).flatMap(([groupId, rows]) => {
    const tripDate = groupDates.get(groupId)
    if (tripDate === undefined) {
      throw new Error(`Missing date for spreadsheet reorder group "${groupId}"`)
    }

    return rows.map((row, sortOrder) => ({
      itemId: row.item.id,
      itemType: row.type,
      tripDate,
      sortOrder,
      ...(timeUpdates.get(getItineraryRowKey(row)) ?? {
        startTime: row.item.startTime,
        endTime: row.item.endTime,
      }),
    }))
  })
}

export function queueSpreadsheetReorder({
  accessToken,
  groupDates,
  onError,
  onPendingChange,
  onSuccess,
  onTripUpdated,
  latestTripRef,
  optimisticTrip,
  pendingCountRef,
  queueRef,
  reorderGenerationRef,
  rowsByGroupId,
  timeUpdates,
}: SpreadsheetReorderQueueOptions) {
  const reorderGeneration = ++reorderGenerationRef.current
  if (pendingCountRef.current === 0) {
    onPendingChange(true)
  }
  pendingCountRef.current += 1

  const queuedRequest = queueRef.current.then(() =>
    reorderDayItems(
      accessToken,
      optimisticTrip.id,
      getSpreadsheetReorderInput(rowsByGroupId, groupDates, timeUpdates),
    ).then(() => undefined),
  )
  queueRef.current = queuedRequest.catch(() => undefined)

  void queuedRequest
    .then(() => {
      if (reorderGeneration === reorderGenerationRef.current) {
        onSuccess?.()
      }
    })
    .catch(async (reason: unknown) => {
      if (reorderGeneration !== reorderGenerationRef.current) {
        return
      }

      onError(getErrorMessage(reason))

      try {
        const refreshedTrip = await getTrip(accessToken, optimisticTrip.id)
        latestTripRef.current = refreshedTrip
        if (
          pendingCountRef.current === 1 &&
          reorderGeneration === reorderGenerationRef.current
        ) {
          onTripUpdated(refreshedTrip)
        }
      } catch (refreshReason: unknown) {
        onError(`${getErrorMessage(reason)} ${getErrorMessage(refreshReason)}`)
      }
    })
    .finally(() => {
      pendingCountRef.current -= 1
      if (pendingCountRef.current === 0) {
        onPendingChange(false)
      }
    })
}
