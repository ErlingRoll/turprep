import { useCallback, useEffect, useState, type ReactNode } from "react"
import { getErrorMessage } from "../lib/errors"
import { subscribeToHttpErrors } from "../lib/http-errors"
import { ToastContext, type Toast, type ToastContextValue } from "./ToastContext"
import { ToastContainer } from "./ToastContainer"

let nextToastId = 0

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback(
    (message: string) => {
      const id = `toast-${++nextToastId}`
      setToasts((currentToasts) => [...currentToasts, { id, message, tone: "error" }])
    },
    [],
  )

  useEffect(
    () =>
      subscribeToHttpErrors((error) => {
        addToast(getErrorMessage(error))
      }),
    [addToast],
  )

  const contextValue: ToastContextValue = {
    addToast,
    dismissToast,
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer onDismiss={dismissToast} toasts={toasts} />
    </ToastContext.Provider>
  )
}
