import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  approveTripAccessRequest,
  createTripAccessLink,
  createTripInvitation,
  denyTripAccessRequest,
  getTripSharing,
  removeTripMember,
  revokeTripAccessLink,
  revokeTripInvitation,
  type TripDetail,
  type TripSharing,
} from "../../api"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { getErrorMessage } from "../../lib/errors"

type TripSharingSettingsProps = {
  accessToken: string
  onCanManageChange?: (canManage: boolean) => void
  trip: TripDetail
}

type PendingSharingDeletion =
  | { id: string; label: string; type: "member" }
  | { id: string; label: string; type: "invitation" }
  | { id: string; label: string; type: "link" }

export function TripSharingSettings({
  accessToken,
  onCanManageChange,
  trip,
}: TripSharingSettingsProps) {
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<TripSharing | null>(null)
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingSharingDeletion | null>(null)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    getTripSharing(accessToken, trip.id)
      .then((nextSharing) => {
        if (isMounted) {
          setSharing(nextSharing)
          onCanManageChange?.(nextSharing.canManage)
        }
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          onCanManageChange?.(false)
          setError(getErrorMessage(reason))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [accessToken, onCanManageChange, trip.id])

  useEffect(() => {
    if (!sharing?.canManage) {
      return
    }

    let isMounted = true
    const refreshInterval = window.setInterval(() => {
      getTripSharing(accessToken, trip.id)
        .then((nextSharing) => {
          if (isMounted) {
            setSharing(nextSharing)
          }
        })
        .catch((reason: unknown) => {
          if (isMounted) {
            setError(getErrorMessage(reason))
          }
        })
    }, 3000)

    return () => {
      isMounted = false
      window.clearInterval(refreshInterval)
    }
  }, [accessToken, sharing?.canManage, trip.id])

  if (isLoading) {
    return (
      <section className="mt-5 border-t border-border-card pt-5">
        <p className="text-sm text-muted">{t("tripSettings.sharingLoading")}</p>
      </section>
    )
  }

  if (!sharing || !sharing.canManage) {
    return null
  }

  async function handleInvite() {
    setIsSaving(true)
    setError(null)
    try {
      const invitation = await createTripInvitation(accessToken, trip.id, { email })
      setSharing((current) =>
        current ? { ...current, invitations: [invitation, ...current.invitations] } : current,
      )
      setEmail("")
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateLink() {
    setIsSaving(true)
    setError(null)
    try {
      const link = await createTripAccessLink(accessToken, trip.id)
      setSharing((current) =>
        current ? { ...current, accessLinks: [link, ...current.accessLinks] } : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleApprove(requestId: string) {
    setIsSaving(true)
    setError(null)
    try {
      const member = await approveTripAccessRequest(accessToken, trip.id, requestId)
      setSharing((current) =>
        current
          ? {
              ...current,
              members: [...current.members, member],
              requests: current.requests.map((request) =>
                request.id === requestId ? { ...request, status: "approved" as const } : request,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeny(requestId: string) {
    setIsSaving(true)
    setError(null)
    try {
      const accessRequest = await denyTripAccessRequest(accessToken, trip.id, requestId)
      setSharing((current) =>
        current
          ? {
              ...current,
              requests: current.requests.map((request) =>
                request.id === requestId ? accessRequest : request,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveMember(userId: string) {
    setIsSaving(true)
    setError(null)
    try {
      await removeTripMember(accessToken, trip.id, userId)
      setSharing((current) =>
        current
          ? {
              ...current,
              members: current.members.filter((member) => member.userId !== userId),
            }
          : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    setIsSaving(true)
    setError(null)
    try {
      const invitation = await revokeTripInvitation(accessToken, trip.id, invitationId)
      setSharing((current) =>
        current
          ? {
              ...current,
              invitations: current.invitations.map((item) =>
                item.id === invitationId ? invitation : item,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRevokeLink(linkId: string) {
    setIsSaving(true)
    setError(null)
    try {
      const link = await revokeTripAccessLink(accessToken, trip.id, linkId)
      setSharing((current) =>
        current
          ? {
              ...current,
              accessLinks: current.accessLinks.map((item) => (item.id === linkId ? link : item)),
            }
          : current,
      )
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmPendingDeletion() {
    const deletion = pendingDeletion

    if (!deletion) {
      return
    }

    try {
      if (deletion.type === "member") {
        await handleRemoveMember(deletion.id)
      } else if (deletion.type === "invitation") {
        await handleRevokeInvitation(deletion.id)
      } else {
        await handleRevokeLink(deletion.id)
      }
    } finally {
      setPendingDeletion(null)
    }
  }

  async function handleCopyLink(linkId: string, token: string) {
    const url = `${window.location.origin}/trips/${trip.id}/request-access?token=${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLinkId(linkId)
    } catch (reason: unknown) {
      setError(getErrorMessage(reason))
    }
  }

  const pendingRequests = sharing.requests.filter((request) => request.status === "pending")
  const activeLinks = sharing.accessLinks.filter((link) => !link.revokedAt)
  const pendingInvitations = sharing.invitations.filter(
    (invitation) => invitation.status === "pending",
  )

  return (
    <section className="mt-5 border-t border-border-card pt-5">
      <h4 className="font-semibold text-brand">{t("tripSettings.sharingTitle")}</h4>
      <p className="mt-1 text-sm text-muted">{t("tripSettings.sharingDescription")}</p>

      <div className="mt-4 grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand"
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("tripSettings.sharingEmailPlaceholder")}
            type="email"
            value={email}
          />
          <button
            className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-60"
            disabled={isSaving || !email.trim()}
            onClick={() => void handleInvite()}
            type="button"
          >
            {t("tripSettings.invite")}
          </button>
        </div>
        <button
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-60"
          disabled={isSaving}
          onClick={() => void handleCreateLink()}
          type="button"
        >
          {t("tripSettings.createAccessLink")}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      {pendingRequests.length > 0 && (
        <div className="mt-5 grid gap-2">
          <h5 className="text-sm font-semibold text-muted">{t("tripSettings.pendingRequests")}</h5>
          {pendingRequests.map((request) => (
            <div
              className="flex flex-col gap-2 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              key={request.id}
            >
              <span className="text-sm text-ink">{request.email}</span>
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-brand-surface px-3 py-1.5 text-xs font-semibold text-on-brand disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => void handleApprove(request.id)}
                  type="button"
                >
                  {t("tripSettings.approve")}
                </button>
                <button
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-error hover:bg-danger-surface disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() => void handleDeny(request.id)}
                  type="button"
                >
                  {t("tripSettings.deny")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-2">
        <h5 className="text-sm font-semibold text-muted">{t("tripSettings.members")}</h5>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
          <span>{t("tripSettings.memberName")}</span>
          <span>{t("tripSettings.memberEmail")}</span>
          <span>{t("tripSettings.memberRole")}</span>
          <span className="sr-only">{t("tripSettings.remove")}</span>
        </div>
        {sharing.members.map((member) => (
          <div
            className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] sm:items-center"
            key={member.userId}
          >
            <div className="min-w-0">
              <span className="mr-2 text-xs font-semibold text-muted sm:hidden">
                {t("tripSettings.memberName")}
              </span>
              <span className="truncate text-sm text-ink">
                {member.name ?? t("tripSettings.memberNameUnavailable")}
              </span>
            </div>
            <div className="min-w-0">
              <span className="mr-2 text-xs font-semibold text-muted sm:hidden">
                {t("tripSettings.memberEmail")}
              </span>
              <span className="truncate text-sm text-muted">{member.email ?? member.userId}</span>
            </div>
            <span className="text-xs font-semibold text-muted">
              <span className="mr-2 sm:hidden">{t("tripSettings.memberRole")}</span>
              {member.role === "owner"
                ? t("tripSettings.ownerRole")
                : t("tripSettings.memberRoleLabel")}
            </span>
            {member.role === "member" && (
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-error hover:bg-danger-surface disabled:opacity-60"
                disabled={isSaving}
                onClick={() =>
                  setPendingDeletion({
                    id: member.userId,
                    label: member.name ?? member.email ?? member.userId,
                    type: "member",
                  })
                }
                type="button"
              >
                {t("tripSettings.remove")}
              </button>
            )}
          </div>
        ))}
      </div>

      {pendingInvitations.length > 0 && (
        <div className="mt-5 grid gap-2">
          <h5 className="text-sm font-semibold text-muted">
            {t("tripSettings.pendingInvitations")}
          </h5>
          {pendingInvitations.map((invitation) => (
            <div
              className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3"
              key={invitation.id}
            >
              <span className="min-w-0 truncate text-sm text-ink">{invitation.email}</span>
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-error hover:bg-danger-surface disabled:opacity-60"
                disabled={isSaving}
                onClick={() =>
                  setPendingDeletion({
                    id: invitation.id,
                    label: invitation.email,
                    type: "invitation",
                  })
                }
                type="button"
              >
                {t("tripSettings.revoke")}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeLinks.length > 0 && (
        <div className="mt-5 grid gap-2">
          <h5 className="text-sm font-semibold text-muted">{t("tripSettings.accessLinks")}</h5>
          {activeLinks.map((link) => (
            <div
              className="flex flex-col gap-2 rounded-xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              key={link.id}
            >
              <code className="min-w-0 truncate text-xs text-muted">
                {`${window.location.origin}/trips/${trip.id}/request-access?token=${link.token}`}
              </code>
              <div className="flex shrink-0 gap-2">
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-muted disabled:opacity-60"
                  onClick={() => void handleCopyLink(link.id, link.token)}
                  type="button"
                >
                  {copiedLinkId === link.id ? t("tripSettings.copied") : t("tripSettings.copy")}
                </button>
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-error hover:bg-danger-surface disabled:opacity-60"
                  disabled={isSaving}
                  onClick={() =>
                    setPendingDeletion({
                      id: link.id,
                      label: link.token,
                      type: "link",
                    })
                  }
                  type="button"
                >
                  {t("tripSettings.revoke")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t(
          pendingDeletion?.type === "member" ? "tripSettings.remove" : "tripSettings.revoke",
        )}
        isConfirming={isSaving}
        isOpen={pendingDeletion !== null}
        message={
          pendingDeletion
            ? pendingDeletion.type === "member"
              ? t("tripSettings.removeMemberConfirmation", { name: pendingDeletion.label })
              : pendingDeletion.type === "invitation"
                ? t("tripSettings.revokeInvitationConfirmation", {
                    email: pendingDeletion.label,
                  })
                : t("tripSettings.revokeAccessLinkConfirmation")
            : ""
        }
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => void confirmPendingDeletion()}
        title={t("common.confirmDeletionTitle")}
      />
    </section>
  )
}
