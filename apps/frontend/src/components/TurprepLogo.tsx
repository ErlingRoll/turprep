type TurprepLogoProps = {
  className?: string
}

export function TurprepLogo({ className = "size-9" }: TurprepLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="fill-brand-surface" height="64" rx="16" width="64" />
      <path className="fill-on-brand" d="M17 16h30v9H36v23h-8V25H17z" />
    </svg>
  )
}
