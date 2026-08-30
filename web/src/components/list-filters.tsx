import type { FormEvent, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function ListFilters({
  onSubmit,
  children,
  className,
}: {
  onSubmit?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <form
      className={cn("mb-4 flex flex-wrap items-end gap-2", className)}
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      {children}
    </form>
  )
}

export function FilterField({
  label,
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      {children}
    </div>
  )
}

export function SearchFilter({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <FilterField label="Search" className={cn("min-w-[12rem] flex-1", className)}>
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </FilterField>
  )
}

export function ApplyFiltersButton() {
  return (
    <Button type="submit" variant="outline">
      Apply
    </Button>
  )
}

export function ToggleFilter({
  options,
  value,
  onChange,
  label,
}: {
  label?: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FilterField label={label}>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant={value === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </FilterField>
  )
}
