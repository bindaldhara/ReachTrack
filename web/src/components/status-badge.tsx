import { Badge } from "@/components/ui/badge"
import { STATUS_LABEL, type Status } from "@/lib/labels"
import { cn } from "@/lib/utils"

const styles: Record<Status, string> = {
  sent: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  replied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  follow_up_due: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  interview: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  closed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
}

export function StatusBadge({ status }: { status: string }) {
  const key = status as Status
  const label = STATUS_LABEL[key] ?? status
  return (
    <Badge variant="secondary" className={cn("font-medium", styles[key] ?? "")}>
      {label}
    </Badge>
  )
}
