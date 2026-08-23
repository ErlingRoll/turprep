import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { getDateLocale } from "../i18n"
import { getPickerPosition, type PickerPosition } from "../lib/picker-position"

type TimePickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoOpen?: boolean
  showLabel?: boolean
  onClose?: (reason: "commit" | "dismiss") => void
}

type TimeParts = {
  hours: number
  minutes: number
}

function parseTime(value: string): TimeParts | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  return hours < 24 && minutes < 60 ? { hours, minutes } : null
}

function formatTimeValue(value: string, locale: string) {
  const time = parseTime(value)

  if (!time) {
    return value
  }

  const date = new Date(Date.UTC(1970, 0, 1, time.hours, time.minutes))

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)
}

function formatTime(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

const minutePresets = [0, 15, 30, 45]
const hourPresets = Array.from({ length: 24 }, (_, hour) => hour)

export function TimePicker({
  label,
  value,
  onChange,
  autoOpen = false,
  showLabel = true,
  onClose,
}: TimePickerProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const hasAutoOpenedRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<PickerPosition | null>(null)
  const [draftHourInput, setDraftHourInput] = useState(
    parseTime(value)?.hours.toString().padStart(2, "0") ?? "",
  )
  const [draftMinuteInput, setDraftMinuteInput] = useState(
    parseTime(value)?.minutes.toString().padStart(2, "0") ?? "",
  )
  const locale = getDateLocale(i18n.language)
  const enteredHour = draftHourInput === "" ? null : Number(draftHourInput)
  const enteredMinute = draftMinuteInput === "" ? null : Number(draftMinuteInput)
  const draftTime =
    enteredHour !== null &&
    enteredMinute !== null &&
    Number.isInteger(enteredHour) &&
    Number.isInteger(enteredMinute) &&
    hourPresets.includes(enteredHour) &&
    minutePresets.includes(enteredMinute)
      ? { hours: enteredHour, minutes: enteredMinute }
      : null
  const cancelPicker = useCallback(() => {
    const time = parseTime(value)
    setDraftHourInput(time ? String(time.hours).padStart(2, "0") : "")
    setDraftMinuteInput(time ? String(time.minutes).padStart(2, "0") : "")
    setIsOpen(false)
    onClose?.("dismiss")
  }, [onClose, value])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let animationFrameId: number | null = null

    function updatePopoverPosition() {
      setPopoverPosition(getPickerPosition(containerRef.current, "fixed"))
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        cancelPicker()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelPicker()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", updatePopoverPosition)
    window.addEventListener("scroll", updatePopoverPosition, true)
    animationFrameId = window.requestAnimationFrame(updatePopoverPosition)

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", updatePopoverPosition)
      window.removeEventListener("scroll", updatePopoverPosition, true)
    }
  }, [cancelPicker, isOpen])

  useEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!autoOpen || hasAutoOpenedRef.current) {
      return
    }

    hasAutoOpenedRef.current = true
    setDraftFromValue(value)
    setPopoverPosition(getPickerPosition(containerRef.current, "fixed"))
    setIsOpen(true)
  }, [autoOpen, value])

  function setDraftFromValue(nextValue: string) {
    const time = parseTime(nextValue)
    setDraftHourInput(time ? String(time.hours).padStart(2, "0") : "")
    setDraftMinuteInput(time ? String(time.minutes).padStart(2, "0") : "")
  }

  function openPicker() {
    setDraftFromValue(value)
    setPopoverPosition(getPickerPosition(containerRef.current, "fixed"))
    setIsOpen(true)
  }

  function clearPicker() {
    setDraftFromValue("")
    onChange("")
    setIsOpen(false)
    onClose?.("commit")
  }

  function savePicker() {
    if (!draftTime) {
      return
    }

    onChange(formatTime(draftTime.hours, draftTime.minutes))
    setIsOpen(false)
    onClose?.("commit")
  }

  return (
    <div className="relative" ref={containerRef}>
      <span className={showLabel ? "grid gap-2 text-sm font-medium text-muted" : "grid"}>
        {showLabel && label}
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={
            value ? `${label}: ${formatTimeValue(value, locale)}` : t("timePicker.chooseTime")
          }
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-left text-ink outline-none transition hover:border-brand focus:border-brand focus:ring-2 focus:ring-soft"
          onClick={isOpen ? cancelPicker : openPicker}
          type="button"
        >
          <span className={value ? "text-ink" : "text-faint"}>
            {value ? formatTimeValue(value, locale) : t("timePicker.chooseTime")}
          </span>
          <span aria-hidden="true" className="text-lg text-brand">
            ▾
          </span>
        </button>
      </span>

      {isOpen && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-ink/25 sm:hidden"
            onClick={cancelPicker}
          />
          <div
            aria-label={t("timePicker.select", { label: label.toLowerCase() })}
            aria-modal="true"
            className="time-picker-popover fixed inset-x-0 bottom-0 z-40 max-h-[90vh] overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-bottom-sheet sm:max-h-[calc(100vh-1rem)] sm:rounded-2xl sm:p-4 sm:shadow-popover"
            role="dialog"
            style={
              popoverPosition
                ? ({
                    "--picker-left": `${popoverPosition.left}px`,
                    "--picker-top": `${popoverPosition.top}px`,
                    "--picker-width": `${popoverPosition.width}px`,
                  } as CSSProperties)
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {showLabel && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                )}
                <p className="mt-1 text-3xl font-semibold tabular-nums text-brand">
                  {draftTime
                    ? formatTimeValue(formatTime(draftTime.hours, draftTime.minutes), locale)
                    : "--:--"}
                </p>
              </div>
              {(value || draftHourInput || draftMinuteInput) && (
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-muted"
                  onClick={clearPicker}
                  type="button"
                >
                  {t("timePicker.clearTime")}
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="grid content-start gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("timePicker.hour")}
                </span>
                <div
                  aria-label={t("timePicker.hour")}
                  className="grid grid-cols-4 gap-1"
                  role="group"
                >
                  {hourPresets.map((hour) => (
                    <button
                      aria-pressed={enteredHour === hour}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold tabular-nums transition ${
                        enteredHour === hour
                          ? "border-brand bg-brand-surface text-on-brand"
                          : "border-border text-muted hover:border-brand hover:text-brand"
                      }`}
                      key={hour}
                      onClick={() => setDraftHourInput(String(hour).padStart(2, "0"))}
                      type="button"
                    >
                      {String(hour).padStart(2, "0")}
                    </button>
                  ))}
                </div>
                <span className="text-center text-xs font-normal text-muted">
                  {t("timePicker.hourHint")}
                </span>
              </div>
              <div className="grid content-start gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("timePicker.minute")}
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {minutePresets.map((minute) => (
                    <button
                      aria-pressed={enteredMinute === minute}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold tabular-nums transition ${
                        enteredMinute === minute
                          ? "border-brand bg-brand-surface text-on-brand"
                          : "border-border text-muted hover:border-brand hover:text-brand"
                      }`}
                      key={minute}
                      onClick={() => setDraftMinuteInput(String(minute).padStart(2, "0"))}
                      type="button"
                    >
                      {String(minute).padStart(2, "0")}
                    </button>
                  ))}
                </div>
                <span className="text-center text-xs font-normal text-muted">
                  {t("timePicker.minuteHint")}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-border-divider pt-4">
              <button
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
                onClick={cancelPicker}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-xl bg-brand-surface px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!draftTime}
                onClick={savePicker}
                type="button"
              >
                {t("timePicker.done")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
