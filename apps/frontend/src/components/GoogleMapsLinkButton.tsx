type GoogleMapsLinkButtonProps = {
  href: string
  label: string
}

export function GoogleMapsLinkButton({ href, label }: GoogleMapsLinkButtonProps) {
  return (
    <a
      aria-label={label}
      className="mt-2 inline-flex w-max items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-muted"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24">
        <path
          d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      {label}
    </a>
  )
}
