import { useEffect, useRef } from "react"
import { getTrip, type TripDetail } from "../../api"
import { getErrorMessage } from "../../lib/errors"
import { getSupabaseClient } from "../../lib/supabase"

type UseTripRealtimeProps = {
  accessToken: string
  tripId: string | undefined
  isPaused: () => boolean
  onError: (message: string) => void
  onTripUpdated: (trip: TripDetail) => void
}

const realtimeTables = [
  { table: "trip_days", column: "trip_id" },
  { table: "activities", column: "trip_id" },
  { table: "meals", column: "trip_id" },
  { table: "housing_stays", column: "trip_id" },
  { table: "trip_item_preferences", column: "trip_id" },
  { table: "trip_members", column: "trip_id" },
  { table: "trip_invitations", column: "trip_id" },
  { table: "trip_access_links", column: "trip_id" },
  { table: "trip_access_requests", column: "trip_id" },
] as const

export function useTripRealtime({
  accessToken,
  tripId,
  isPaused,
  onError,
  onTripUpdated,
}: UseTripRealtimeProps) {
  const onErrorRef = useRef(onError)
  const onTripUpdatedRef = useRef(onTripUpdated)
  const isPausedRef = useRef(isPaused)

  useEffect(() => {
    onErrorRef.current = onError
    onTripUpdatedRef.current = onTripUpdated
    isPausedRef.current = isPaused
  }, [isPaused, onError, onTripUpdated])

  useEffect(() => {
    if (!tripId) {
      return
    }

    const client = getSupabaseClient()
    const channel = client.channel(`trip-updates:${tripId}`)
    let refreshTimer: number | null = null

    const refreshTrip = () => {
      if (isPausedRef.current()) {
        refreshTimer = window.setTimeout(refreshTrip, 300)
        return
      }

      void getTrip(accessToken, tripId)
        .then((nextTrip) => {
          if (isPausedRef.current()) {
            refreshTimer = window.setTimeout(refreshTrip, 300)
            return
          }

          onTripUpdatedRef.current(nextTrip)
        })
        .catch((reason: unknown) => {
          onErrorRef.current(getErrorMessage(reason))
        })
    }

    const scheduleRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      refreshTimer = window.setTimeout(refreshTrip, 250)
    }

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "trips",
        filter: `id=eq.${tripId}`,
      },
      scheduleRefresh,
    )

    for (const { table, column } of realtimeTables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${column}=eq.${tripId}`,
        },
        scheduleRefresh,
      )
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        onErrorRef.current("Realtime updates are unavailable")
      }
    })

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      void client.removeChannel(channel)
    }
  }, [accessToken, tripId])
}
