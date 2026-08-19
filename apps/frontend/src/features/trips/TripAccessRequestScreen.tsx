import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { getTripAccessStatus, requestTripAccess, type TripAccessStatus } from "../../api"
import { getErrorMessage } from "../../lib/errors"

type TripAccessRequestScreenProps = {
  accessToken: string
}

export function TripAccessRequestScreen({ accessToken }: TripAccessRequestScreenProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tripId } = useParams<{ tripId: string }>()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [accessStatus, setAccessStatus] = useState<TripAccessStatus | null>(null)

  const invitationId = searchParams.get("invitationId")
  const accessLinkToken = searchParams.get("token")

  useEffect(() => {
    if (!tripId) {
      setIsCheckingStatus(false)
      return
    }

    let isMounted = true
    setIsCheckingStatus(true)
    getTripAccessStatus(accessToken, tripId)
      .then((status) => {
        if (!isMounted) {
          return
        }

        if (status.status === "approved") {
          navigate(`/trips/${tripId}`, { replace: true })
          return
        }

        setAccessStatus(status)
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingStatus(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [accessToken, navigate, tripId])

  useEffect(() => {
    if (!tripId || accessStatus?.status !== "pending") {
      return
    }

    let isMounted = true
    const statusInterval = window.setInterval(() => {
      getTripAccessStatus(accessToken, tripId)
        .then((status) => {
          if (!isMounted) {
            return
          }

          if (status.status === "approved") {
            navigate(`/trips/${tripId}`, { replace: true })
            return
          }

          setAccessStatus(status)
        })
        .catch((reason: unknown) => {
          if (isMounted) {
            setError(getErrorMessage(reason))
          }
        })
    }, 3000)

    return () => {
      isMounted = false
      window.clearInterval(statusInterval)
    }
  }, [accessToken, accessStatus?.status, navigate, tripId])

  async function handleRequest() {
    if (!tripId || (!invitationId && !accessLinkToken) || accessStatus?.status !== "none") {
      setError(t("tripAccess.invalidLink"))
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const status = await requestTripAccess(accessToken, tripId, {
        invitationId: invitationId ?? undefined,
        accessLinkToken: accessLinkToken ?? undefined,
      })
      if (status.status === "approved") {
        navigate(`/trips/${tripId}`, { replace: true })
        return
      }

      setAccessStatus(status)
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-page px-5">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-semibold text-brand">{t("tripAccess.title")}</h1>
        <p className="mt-2 text-sm text-muted">
          {isCheckingStatus
            ? t("common.loading")
            : accessStatus?.status === "pending"
              ? t("tripAccess.pendingDescription")
              : accessStatus?.status === "denied"
                ? t("tripAccess.deniedDescription")
                : t("tripAccess.description")}
        </p>
        {error && <p className="mt-4 text-sm text-error">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
            onClick={() => navigate("/")}
            type="button"
          >
            {t("common.cancel")}
          </button>
          {!isCheckingStatus && accessStatus?.status === "none" && (
            <button
              className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void handleRequest()}
              type="button"
            >
              {isSubmitting ? t("common.saving") : t("tripAccess.request")}
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
