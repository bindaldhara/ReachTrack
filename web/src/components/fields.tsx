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

export function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TYPES.map((s) => (
          <SelectItem key={s} value={s}>
            {TYPE_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ChannelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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

export function KindSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
  placeholder: string
}) {
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
