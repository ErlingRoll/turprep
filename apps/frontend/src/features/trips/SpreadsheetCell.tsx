import type { ReactNode } from "react"

export function SpreadsheetCell({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <td className={`border-b border-border-divider px-3 py-2 align-top text-sm ${className}`}>
      {children}
    </td>
  )
}

export function SpreadsheetHeaderCell({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <th
      className={`border-b border-border-divider bg-surface-muted px-3 py-2 first:rounded-tl-2xl last:rounded-tr-2xl ${className}`}
    >
      {children}
    </th>
  )
}
