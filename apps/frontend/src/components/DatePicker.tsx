import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { getDateLocale, getWeekdayLabels } from "../i18n"
import { getPickerPosition, type PickerPosition } from "../lib/picker-position"

type DatePickerProps = {
  label: string
  value: string
  onChange: (value: string) => void
  minDate?: string
  maxDate?: string
  clearable?: boolean
  error?: string | null
}

function parseDate(value: string) {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getToday() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

function getCalendarDays(viewDate: Date) {
  const year = viewDate.getUTCFullYear()
  const month = viewDate.getUTCMonth()
  const firstDay = new Date(Date.UTC(year, month, 1))
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    if (index < firstWeekday) {
      return null
    }

    return new Date(Date.UTC(year, month, index - firstWeekday + 1))
  })
}

export function DatePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  clearable = false,
  error = null,
}: DatePickerProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const errorId = `date-picker-error-${label.toLowerCase().replaceAll(/\s+/g, "-")}`
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<PickerPosition | null>(null)
  const [viewDate, setViewDate] = useState(() => parseDate(value) ?? getToday())
  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate])
  const locale = getDateLocale(i18n.language)
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  })
  const language = i18n.language === "en" ? "en" : "nb"
  const weekdayLabels = getWeekdayLabels(language)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function updatePopoverPosition() {
      setPopoverPosition(getPickerPosition(containerRef.current))
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", updatePopoverPosition)
    window.addEventListener("scroll", updatePopoverPosition, true)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", updatePopoverPosition)
      window.removeEventListener("scroll", updatePopoverPosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null)
    }
  }, [isOpen])

  function openPicker() {
    setViewDate(parseDate(value) ?? parseDate(minDate ?? "") ?? getToday())
    setPopoverPosition(getPickerPosition(containerRef.current))
    setIsOpen(true)
  }

  function moveMonth(monthOffset: number) {
    setViewDate(
      (currentDate) =>
        new Date(
          Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + monthOffset, 1),
        ),
    )
  }

  function selectDate(date: Date) {
    const nextValue = formatDateValue(date)

    if ((minDate && nextValue < minDate) || (maxDate && nextValue > maxDate)) {
      return
    }

    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <span className="grid gap-2 text-sm font-medium text-muted">
        {label}
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-label={
            value
              ? `${label}: ${dateFormatter.format(parseDate(value)!)}`
              : t("datePicker.chooseDate")
          }
          className={`flex min-h-12 w-full items-center justify-between rounded-xl border bg-surface px-3 text-left text-ink outline-none transition hover:border-brand focus:border-brand focus:ring-2 focus:ring-soft ${
            error ? "border-error" : "border-border"
          }`}
          onClick={isOpen ? () => setIsOpen(false) : openPicker}
          type="button"
        >
          <span className={value ? "text-ink" : "text-faint"}>
            {value ? dateFormatter.format(parseDate(value)!) : t("datePicker.chooseDate")}
          </span>
          <span aria-hidden="true" className="text-lg text-brand">
            ▾
          </span>
        </button>
        {error && (
          <p className="text-xs font-normal text-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </span>

      {isOpen && popoverPosition && (
        <div
          aria-label={t("datePicker.select", { label: label.toLowerCase() })}
          className="absolute z-20 max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-popover"
          role="dialog"
          style={{
            left: popoverPosition.left,
            top: popoverPosition.top,
            width: popoverPosition.width,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              aria-label={t("common.previousMonth")}
              className="grid size-11 place-items-center rounded-xl text-2xl text-on-surface hover:bg-surface-muted"
              onClick={() => moveMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <p className="capitalize font-semibold text-brand">{monthFormatter.format(viewDate)}</p>
            <button
              aria-label={t("common.nextMonth")}
              className="grid size-11 place-items-center rounded-xl text-2xl text-on-surface hover:bg-surface-muted"
              onClick={() => moveMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted">
            {weekdayLabels.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <span aria-hidden="true" key={`empty-${index}`} />
              }

              const dateValue = formatDateValue(date)
              const isDisabled = Boolean(
                (minDate && dateValue < minDate) || (maxDate && dateValue > maxDate),
              )
              const isSelected = value === dateValue

              return (
                <button
                  aria-label={dateFormatter.format(date)}
                  aria-pressed={isSelected}
                  className={`min-h-11 rounded-xl text-sm font-medium transition ${
                    isSelected
                      ? "bg-brand-surface text-on-brand"
                      : isDisabled
                        ? "cursor-not-allowed text-disabled"
                        : "text-ink hover:bg-surface-muted"
                  }`}
                  disabled={isDisabled}
                  key={dateValue}
                  onClick={() => selectDate(date)}
                  type="button"
                >
                  {date.getUTCDate()}
                </button>
              )
            })}
          </div>
          {clearable && value && (
            <button
              className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-muted"
              onClick={() => {
                onChange("")
                setIsOpen(false)
              }}
              type="button"
            >
              {t("datePicker.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
