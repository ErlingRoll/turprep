import { useEffect, useState } from "react"
import type { RealtimeChannel, User } from "@supabase/supabase-js"
import { getSupabaseClient } from "../../lib/supabase"

const presenceTimeoutMs = 60_000
const heartbeatIntervalMs = 15_000
const staleRefreshIntervalMs = 5_000

export type TripPresenceViewer = {
  avatarUrl: string | null
  label: string
  seenAt: string
  userId: string
}

type TripPresencePayload = Omit<TripPresenceViewer, "avatarUrl"> & {
  avatarUrl?: string | null
}

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

function getUserAvatarUrl(user: User) {
  const metadata = user.user_metadata
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const candidate =
    "avatar_url" in metadata ? metadata.avatar_url : "picture" in metadata ? metadata.picture : null
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null
  }

  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function collectActiveViewers(
  presenceState: Record<string, TripPresencePayload[]>,
  currentUserId: string,
  currentUserLabel: string,
  currentUserAvatarUrl: string | null,
  now = Date.now(),
) {
  const latestByUserId = new Map<string, TripPresenceViewer>()
  latestByUserId.set(currentUserId, {
    avatarUrl: currentUserAvatarUrl,
    label: currentUserLabel,
    seenAt: new Date(now).toISOString(),
    userId: currentUserId,
  })

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
      latestByUserId.set(payload.userId, {
        avatarUrl: payload.avatarUrl ?? null,
        label: payload.label,
        seenAt: payload.seenAt,
        userId: payload.userId,
      })
    }
  }

  const currentUser = latestByUserId.get(currentUserId)
  const otherViewers = Array.from(latestByUserId.values())
    .filter((viewer) => viewer.userId !== currentUserId)
    .sort((left, right) => left.label.localeCompare(right.label))

  return currentUser ? [currentUser, ...otherViewers] : otherViewers
}

export function useTripPresence(tripId: string | undefined, accessToken: string) {
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
    let currentUserAvatarUrl: string | null = null

    function refreshViewers() {
      if (!channel || !isActive || !currentUserId) {
        return
      }

      const presenceState = channel.presenceState() as Record<string, TripPresencePayload[]>
      setViewers(
        collectActiveViewers(
          presenceState,
          currentUserId,
          currentUserLabel,
          currentUserAvatarUrl,
        ),
      )
    }

    function trackPresence() {
      if (!channel || !isActive || !currentUserId) {
        return
      }

      const seenAt = new Date().toISOString()
      const payload: TripPresencePayload = {
        avatarUrl: currentUserAvatarUrl,
        label: currentUserLabel,
        seenAt,
        userId: currentUserId,
      }

      void channel.track(payload).then(refreshViewers)
    }

    let currentUserLabel = ""

    void client.realtime
      .setAuth(accessToken)
      .then(() => client.auth.getUser())
      .then(({ data }) => {
        if (!isActive || !data.user) {
          return
        }

        currentUserId = data.user.id
        currentUserLabel = getUserLabel(data.user)
        currentUserAvatarUrl = getUserAvatarUrl(data.user)
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
  }, [accessToken, tripId])

  return viewers
}
