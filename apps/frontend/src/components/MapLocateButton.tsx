type MapLocateButtonProps = {
  label: string
  onClick: () => void
}

export function MapLocateButton({ label, onClick }: MapLocateButtonProps) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center touch-manipulation rounded-xl border border-border bg-surface p-2 text-on-surface hover:bg-surface-muted"
      onClick={onClick}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
        <path
          d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="M9 3v15M15 6v15" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  )
}
