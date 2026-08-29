import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { FIRST_MAIL_TYPES, outreachPagePath } from "@/lib/outreach-filters"
import type { OutreachEvent, Reminder, Stats } from "@/lib/types"
import { formatDate } from "@/lib/types"

const DASHBOARD_METRICS = [
  {
    key: "firstMailSent" as const,
    label: "First-time mail sent",
    hint: "Cold emails, referrals, applications",
    to: outreachPagePath({ types: FIRST_MAIL_TYPES }),
  },
  {
    key: "followUpsTaken" as const,
    label: "Took follow-up",
    hint: "Follow-up messages you sent",
    to: outreachPagePath({ type: "follow_up" }),
  },
  {
    key: "replies" as const,
    label: "Replies",
    hint: "Company replied (not rejections or interviews)",
    to: outreachPagePath({ status: "replied" }),
  },
  {
    key: "possibleRejections" as const,
    label: "Possible rejections",
    hint: "AI-detected — review and confirm on Outreach",
    to: outreachPagePath({ statusSuggestion: "rejected" }),
  },
  {
    key: "rejections" as const,
    label: "Rejections",
    hint: "Confirmed after you mark a suggestion as rejected",
    to: outreachPagePath({ types: FIRST_MAIL_TYPES, status: "rejected" }),
  },
  {
    key: "followUpDue" as const,
    label: "Follow-up due",
    hint: "No reply after 1+ days — time to nudge",
    to: outreachPagePath({ types: FIRST_MAIL_TYPES, status: "follow_up_due" }),
  },
]

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
        {error}. Confirm the API is running and DATABASE_URL / SUPABASE_URL are set.
      </p>
    )
  }

  const dash = stats?.outreachDashboard

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Outreach pipeline from Gmail import and manual logging.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_METRICS.map(({ key, label, hint, to }) => (
          <Link key={key} to={to} className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="transition-colors group-hover:bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium group-hover:underline">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-2xl">{dash?.[key] ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                <p className="mt-2 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  View list →
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Contacts" value={stats?.totalContacts ?? "—"} />
        <StatCard label="Companies" value={stats?.totalCompanies ?? "—"} />
        <StatCard label="Open reminders" value={stats?.openReminders ?? "—"} />
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

      <p className="text-xs text-muted-foreground">
        Counts use rule-based Gmail classification (thread context + keywords), not AI.{" "}
        <Link to="/outreach" className="underline underline-offset-2">
          View all outreach
        </Link>
      </p>
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
