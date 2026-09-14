import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

type TripMapSearchProps = {
  className?: string
  hasResult: boolean
  isSearching: boolean
  onClear: () => void
  onSearch: (query: string) => void
}

/**
 * Free-text place search for the map. It spans the full width of its toolbar
 * row, and is hidden below the desktop breakpoint where the map has no room
 * for it. The parent owns the lookup and the temporary result pin; this
 * component only collects the query.
 */
export function TripMapSearch({
  className = "",
  hasResult,
  isSearching,
  onClear,
  onSearch,
}: TripMapSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const trimmedQuery = query.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!trimmedQuery || isSearching) {
      return
    }

    onSearch(trimmedQuery)
  }

  function handleClear() {
    setQuery("")
    onClear()
  }

  return (
    <form
      className={`hidden w-full items-center gap-2 lg:flex ${className}`}
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="relative min-w-0 flex-1">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
          fill="none"
          viewBox="0 0 16 16"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
          <path d="M10.8 10.8 15 15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
        <input
          aria-label={t("tripMap.searchLabel")}
          className="w-full rounded-lg border border-border bg-input py-2 pl-9 pr-3 text-sm text-input-ink outline-none focus:border-brand"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tripMap.searchPlaceholder")}
          type="search"
          value={query}
        />
      </div>
      <button
        className="shrink-0 rounded-lg bg-brand-surface px-3.5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-surface-hover disabled:opacity-60"
        disabled={isSearching || !trimmedQuery}
        type="submit"
      >
        {isSearching ? t("tripMap.searching") : t("tripMap.search")}
      </button>
      {(hasResult || trimmedQuery.length > 0) && (
        <button
          className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-semibold text-muted hover:bg-surface-muted"
          onClick={handleClear}
          type="button"
        >
          {t("tripMap.searchClear")}
        </button>
      )}
    </form>
  )
}
