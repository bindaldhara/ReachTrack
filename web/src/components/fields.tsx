import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CHANNELS,
  CHANNEL_LABEL,
  REMINDER_KINDS,
  REMINDER_KIND_LABEL,
  SOURCES,
  SOURCE_LABEL,
  STATUSES,
  STATUS_LABEL,
  TYPES,
  TYPE_LABEL,
} from "@/lib/labels"

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function StatusSelect({
  value,
  onChange,
  allowAll,
}: {
  value: string
  onChange: (v: string) => void
  allowAll?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value="all">All statuses</SelectItem> : null}
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TypeSelect({
  value,
  onChange,
  allowAll,
}: {
  value: string
  onChange: (v: string) => void
  allowAll?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value="all">All types</SelectItem> : null}
        {TYPES.map((s) => (
          <SelectItem key={s} value={s}>
            {TYPE_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ChannelSelect({
  value,
  onChange,
  allowAll,
}: {
  value: string
  onChange: (v: string) => void
  allowAll?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value="all">All channels</SelectItem> : null}
        {CHANNELS.map((s) => (
          <SelectItem key={s} value={s}>
            {CHANNEL_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOURCES.map((s) => (
          <SelectItem key={s} value={s}>
            {SOURCE_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function KindSelect({
  value,
  onChange,
  allowAll,
}: {
  value: string
  onChange: (v: string) => void
  allowAll?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value="all">All kinds</SelectItem> : null}
        {REMINDER_KINDS.map((s) => (
          <SelectItem key={s} value={s}>
            {REMINDER_KIND_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function RelatedSelect({
  value,
  onChange,
  options,
  placeholder,
  allowAllLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
  placeholder: string
  allowAllLabel?: string
}) {
  const emptyValue = allowAllLabel ? "all" : "none"
  return (
    <Select value={value || emptyValue} onValueChange={(v) => onChange(v === emptyValue ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAllLabel ? (
          <SelectItem value="all">{allowAllLabel}</SelectItem>
        ) : (
          <SelectItem value="none">None</SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
