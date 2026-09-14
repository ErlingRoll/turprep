import { useTranslation } from "react-i18next"
import type { Toast, ToastTone } from "./ToastContext"

const toneStyles: Record<ToastTone, { card: string; dismiss: string; progress: string }> = {
  error: {
    card: "border-danger-border bg-error-surface text-error",
    dismiss: "text-error hover:bg-danger-surface",
    progress: "toast-dismiss-progress-error",
  },
  info: {
    card: "border-info-border bg-info-surface text-info",
    dismiss: "text-info hover:bg-info-surface-hover",
    progress: "toast-dismiss-progress-info",
  },
  success: {
    card: "border-success-border bg-success-surface text-success-body",
    dismiss: "text-success-body hover:bg-success-surface-hover",
    progress: "toast-dismiss-progress-success",
  },
}

type ToastContainerProps = {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const { t } = useTranslation()

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-stretch gap-3 sm:left-auto sm:right-4 sm:w-[26rem]"
      role="region"
    >
      {toasts.map((toast) => (
        <div
          className={`toast pointer-events-auto relative overflow-hidden rounded-2xl border p-5 text-base leading-6 shadow-card ${toneStyles[toast.tone].card}`}
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.message}</p>
            <button
              aria-label={t("common.close")}
              className={`shrink-0 rounded-lg px-2 py-1 text-sm font-semibold ${toneStyles[toast.tone].dismiss}`}
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              {t("common.close")}
            </button>
          </div>
          <div
            className={`toast-dismiss-progress ${toneStyles[toast.tone].progress}`}
            onAnimationEnd={() => onDismiss(toast.id)}
          />
        </div>
      ))}
    </div>
  )
}
