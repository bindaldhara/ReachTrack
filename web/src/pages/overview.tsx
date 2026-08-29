import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { STATUSES, STATUS_LABEL } from "@/lib/labels"
import type { OutreachEvent, Reminder, Stats } from "@/lib/types"
import { formatDate } from "@/lib/types"

export function OverviewPage() {
  const { request } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<OutreachEvent[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      request<Stats>("/api/v1/stats"),
      request<OutreachEvent[]>("/api/v1/outreach-events?limit=8"),
      request<Reminder[]>("/api/v1/reminders?open=true&limit=8"),
    ])
      .then(([s, events, rems]) => {
        if (cancelled) return
        setStats(s)
        setRecent(events)
        setReminders(rems)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load")
      })
    return () => {
      cancelled = true
    }
  }, [request])

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error}. Confirm the Go API is running and DATABASE_URL / SUPABASE_URL are set.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline status across outreach, conversations, and jobs.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outreach events" value={stats?.totalOutreach ?? "—"} />
        <StatCard label="Contacts" value={stats?.totalContacts ?? "—"} />
        <StatCard label="Companies" value={stats?.totalCompanies ?? "—"} />
        <StatCard label="Open reminders" value={stats?.openReminders ?? "—"} />
      </div>
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Outreach by status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {STATUSES.map((status) => (
            <Link key={status} to={`/outreach?status=${status}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{STATUS_LABEL[status]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-heading text-2xl">{stats?.outreachByStatus[status] ?? 0}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent outreach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outreach yet. Log your first event.</p>
            ) : (
              recent.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{e.subject || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.occurredAt)}</p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming reminders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open reminders.</p>
            ) : (
              reminders.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{r.notes || r.kind.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(r.dueAt)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl">{value}</p>
      </CardContent>
    </Card>
  )
}
