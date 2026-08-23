import { useEffect, useState } from "react"
import type { RealtimeChannel, User } from "@supabase/supabase-js"
import { getSupabaseClient } from "../../lib/supabase"

const presenceTimeoutMs = 15_000
const heartbeatIntervalMs = 5_000
const staleRefreshIntervalMs = 2_000

export type TripPresenceViewer = {
  label: string
  seenAt: string
  userId: string
}

type TripPresencePayload = TripPresenceViewer

function getUserLabel(user: User) {
  const metadata = user.user_metadata
  if (metadata && typeof metadata === "object") {
    const fullName = "full_name" in metadata ? metadata.full_name : null
    if (typeof fullName === "string" && fullName.trim()) {
      return fullName.trim()
    }

    const name = "name" in metadata ? metadata.name : null
    if (typeof name === "string" && name.trim()) {
      return name.trim()
    }
  }

  return user.email?.trim() || user.id
}

function collectActiveViewers(
  presenceState: Record<string, TripPresencePayload[]>,
  currentUserId: string,
  now = Date.now(),
) {
  const latestByUserId = new Map<string, TripPresencePayload>()

  for (const payload of Object.values(presenceState).flat()) {
    if (payload.userId === currentUserId) {
      continue
    }

    const seenAtMs = Date.parse(payload.seenAt)
    if (!Number.isFinite(seenAtMs) || now - seenAtMs > presenceTimeoutMs) {
      continue
    }

    const previous = latestByUserId.get(payload.userId)
    if (!previous || Date.parse(previous.seenAt) < seenAtMs) {
      latestByUserId.set(payload.userId, payload)
    }
  }

  return Array.from(latestByUserId.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  )
}

export function useTripPresence(tripId: string | undefined) {
  const [viewers, setViewers] = useState<TripPresenceViewer[]>([])

  useEffect(() => {
    if (!tripId) {
      setViewers([])
      return
    }

    setViewers([])
    const client = getSupabaseClient()
    const channelName = `trip-presence:${tripId}`
    let channel: RealtimeChannel | null = null
    let isActive = true
    let heartbeatTimer: number | null = null
    let staleRefreshTimer: number | null = null
    let currentUserId = ""

    function refreshViewers() {
      if (!channel || !isActive || !currentUserId) {
        return
      }

      const presenceState = channel.presenceState() as Record<string, TripPresencePayload[]>
      setViewers(collectActiveViewers(presenceState, currentUserId))
    }

    function trackPresence() {
      if (!channel || !isActive || !currentUserId) {
        return
      }

      const seenAt = new Date().toISOString()
      const payload: TripPresencePayload = {
        label: currentUserLabel,
        seenAt,
        userId: currentUserId,
      }

      void channel.track(payload).then(refreshViewers)
    }

    let currentUserLabel = ""

    void client.auth.getUser().then(({ data }) => {
      if (!isActive || !data.user) {
        return
      }

      currentUserId = data.user.id
      currentUserLabel = getUserLabel(data.user)
      channel = client.channel(channelName, {
        config: {
          presence: {
            key: currentUserId,
          },
        },
      })

      channel.on("presence", { event: "sync" }, refreshViewers)
      channel.on("presence", { event: "join" }, refreshViewers)
      channel.on("presence", { event: "leave" }, refreshViewers)
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          trackPresence()
        }
      })

      heartbeatTimer = window.setInterval(trackPresence, heartbeatIntervalMs)
      staleRefreshTimer = window.setInterval(refreshViewers, staleRefreshIntervalMs)
      refreshViewers()
    })

    return () => {
      isActive = false
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer)
      }
      if (staleRefreshTimer !== null) {
        window.clearInterval(staleRefreshTimer)
      }
      if (channel) {
        void client.removeChannel(channel)
      }
    }
  }, [tripId])

  return viewers
}
