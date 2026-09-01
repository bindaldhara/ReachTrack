import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatedStat } from "@/components/animated-stat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusSelect } from "@/components/fields"
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter, ToggleFilter } from "@/components/list-filters"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { OUTBOUND_FIRST_MAIL_TYPES, outreachPagePath } from "@/lib/outreach-filters"
import { listQuery } from "@/lib/list-query"
import { REMINDER_KIND_LABEL } from "@/lib/labels"
import type { OutreachEvent, PaginatedList, Reminder, Stats } from "@/lib/types"
import { formatDate } from "@/lib/types"
import { cn } from "@/lib/utils"

const METRIC_PALETTE = {
  cyan: {
    value: "text-[#00FBFF]",
    label: "group-hover:text-[#00FBFF]",
    chipBorder: "border-[#00FBFF]/40",
    chipBorderActive: "border-[#00FBFF]/70",
    chipBg: "bg-[#00FBFF]/10",
    cardBorder: "hover:border-[#00FBFF]/50",
    cardBorderActive: "border-[#00FBFF]/70",
    ring: "ring-[#00FBFF]/25",
    gradient: "from-[#00FBFF]/12",
    glow: "shadow-[0_12px_40px_rgba(0,251,255,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(0,251,255,0.2)]",
    link: "text-[#00FBFF]",
    chipHover: "group-hover:border-[#00FBFF]/70 group-hover:bg-[#00FBFF]/15",
  },
  emerald: {
    value: "text-emerald-400",
    label: "group-hover:text-emerald-400",
    chipBorder: "border-emerald-400/40",
    chipBorderActive: "border-emerald-400/70",
    chipBg: "bg-emerald-400/10",
    cardBorder: "hover:border-emerald-400/50",
    cardBorderActive: "border-emerald-400/70",
    ring: "ring-emerald-400/25",
    gradient: "from-emerald-400/12",
    glow: "shadow-[0_12px_40px_rgba(52,211,153,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(52,211,153,0.2)]",
    link: "text-emerald-400",
    chipHover: "group-hover:border-emerald-400/70 group-hover:bg-emerald-400/15",
  },
  amber: {
    value: "text-amber-400",
    label: "group-hover:text-amber-400",
    chipBorder: "border-amber-400/40",
    chipBorderActive: "border-amber-400/70",
    chipBg: "bg-amber-400/10",
    cardBorder: "hover:border-amber-400/50",
    cardBorderActive: "border-amber-400/70",
    ring: "ring-amber-400/25",
    gradient: "from-amber-400/12",
    glow: "shadow-[0_12px_40px_rgba(251,191,36,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(251,191,36,0.2)]",
    link: "text-amber-400",
    chipHover: "group-hover:border-amber-400/70 group-hover:bg-amber-400/15",
  },
  rose: {
    value: "text-rose-400",
    label: "group-hover:text-rose-400",
    chipBorder: "border-rose-400/40",
    chipBorderActive: "border-rose-400/70",
    chipBg: "bg-rose-400/10",
    cardBorder: "hover:border-rose-400/50",
    cardBorderActive: "border-rose-400/70",
    ring: "ring-rose-400/25",
    gradient: "from-rose-400/12",
    glow: "shadow-[0_12px_40px_rgba(251,113,133,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(251,113,133,0.2)]",
    link: "text-rose-400",
    chipHover: "group-hover:border-rose-400/70 group-hover:bg-rose-400/15",
  },
  violet: {
    value: "text-violet-400",
    label: "group-hover:text-violet-400",
    chipBorder: "border-violet-400/40",
    chipBorderActive: "border-violet-400/70",
    chipBg: "bg-violet-400/10",
    cardBorder: "hover:border-violet-400/50",
    cardBorderActive: "border-violet-400/70",
    ring: "ring-violet-400/25",
    gradient: "from-violet-400/12",
    glow: "shadow-[0_12px_40px_rgba(167,139,250,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(167,139,250,0.2)]",
    link: "text-violet-400",
    chipHover: "group-hover:border-violet-400/70 group-hover:bg-violet-400/15",
  },
  sky: {
    value: "text-sky-400",
    label: "group-hover:text-sky-400",
    chipBorder: "border-sky-400/40",
    chipBorderActive: "border-sky-400/70",
    chipBg: "bg-sky-400/10",
    cardBorder: "hover:border-sky-400/50",
    cardBorderActive: "border-sky-400/70",
    ring: "ring-sky-400/25",
    gradient: "from-sky-400/12",
    glow: "shadow-[0_12px_40px_rgba(56,189,248,0.18)]",
    chipGlow: "shadow-[0_0_20px_rgba(56,189,248,0.2)]",
    link: "text-sky-400",
    chipHover: "group-hover:border-sky-400/70 group-hover:bg-sky-400/15",
  },
} as const

type MetricPalette = keyof typeof METRIC_PALETTE

const DASHBOARD_METRICS = [
  {
    key: "firstMailSent" as const,
    label: "First-time mail sent",
    hint: "Cold emails you sent",
    chip: "sent",
    tone: "cyan" as MetricPalette,
    to: outreachPagePath({ types: OUTBOUND_FIRST_MAIL_TYPES }),
  },
  {
    key: "followUpsTaken" as const,
    label: "Took follow-up",
    hint: "Follow-up messages you sent",
    chip: "follow-ups",
    tone: "sky" as MetricPalette,
    to: outreachPagePath({ type: "follow_up" }),
  },
  {
    key: "replies" as const,
    label: "Replies",
    hint: "Company replied (not rejections or interviews)",
    chip: "replies",
    tone: "emerald" as MetricPalette,
    to: outreachPagePath({ status: "replied" }),
  },
  {
    key: "possibleRejections" as const,
    label: "Possible rejections",
    hint: "AI-detected — review and confirm on Outreach",
    chip: "to review",
    tone: "amber" as MetricPalette,
    to: outreachPagePath({ statusSuggestion: "rejected" }),
  },
  {
    key: "rejections" as const,
    label: "Rejections",
    hint: "Confirmed after you mark a suggestion as rejected",
    chip: "confirmed",
    tone: "rose" as MetricPalette,
    to: outreachPagePath({ types: OUTBOUND_FIRST_MAIL_TYPES, status: "rejected" }),
  },
  {
    key: "followUpDue" as const,
    label: "Follow-up due",
    hint: "No reply after 1+ days — time to nudge",
    chip: "due now",
    tone: "amber" as MetricPalette,
    to: outreachPagePath({ types: OUTBOUND_FIRST_MAIL_TYPES, status: "follow_up_due" }),
  },
]

export function OverviewPage() {
  const { request } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<OutreachEvent[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [outreachStatus, setOutreachStatus] = useState("all")
  const [outreachQ, setOutreachQ] = useState("")
  const [remindersOpen, setRemindersOpen] = useState(true)
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadRecent(status = outreachStatus, search = outreachQ) {
    const qs = listQuery({
      limit: "8",
      status: status !== "all" ? status : undefined,
      q: search.trim() || undefined,
    })
    const rows = await request<PaginatedList<OutreachEvent>>(`/api/v1/outreach-events${qs}`)
    setRecent(rows.items)
  }

  async function loadReminders(open = remindersOpen) {
    const qs = listQuery({ limit: "8", open: open ? "true" : "false" })
    const rows = await request<PaginatedList<Reminder>>(`/api/v1/reminders${qs}`)
    setReminders(rows.items)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      request<Stats>("/api/v1/stats"),
      request<PaginatedList<OutreachEvent>>("/api/v1/outreach-events?limit=8"),
      request<PaginatedList<Reminder>>("/api/v1/reminders?open=true&limit=8"),
    ])
      .then(([s, events, rems]) => {
        if (cancelled) return
        setStats(s)
        setRecent(events.items)
        setReminders(rems.items)
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_METRICS.map(({ key, label, hint, chip, tone, to }) => {
          const value = dash?.[key]
          const active = activeMetric === key
          const palette = METRIC_PALETTE[tone]
          return (
            <Link
              key={key}
              to={to}
              onMouseEnter={() => setActiveMetric(key)}
              onMouseLeave={() => setActiveMetric(null)}
              onFocus={() => setActiveMetric(key)}
              onBlur={() => setActiveMetric(null)}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FBFF]/50"
            >
              <Card
                className={cn(
                  "relative overflow-hidden border border-white/10 transition-all duration-300",
                  "hover:-translate-y-1",
                  palette.cardBorder,
                  active && cn("scale-[1.02]", palette.cardBorderActive, palette.glow),
                  palette.ring,
                  "ring-1",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent opacity-0 transition-opacity duration-300",
                    palette.gradient,
                    (active || undefined) && "opacity-100",
                    "group-hover:opacity-100",
                  )}
                />
                <CardHeader className="relative pb-2">
                  <CardTitle className={cn("text-sm font-medium text-white/80", palette.label)}>
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="flex items-end justify-between gap-3">
                    <p className={cn("font-heading text-4xl font-semibold tracking-tight", palette.value)}>
                      {typeof value === "number" ? <AnimatedStat value={value} /> : "—"}
                    </p>
                    <div
                      className={cn(
                        "flex min-w-[4.5rem] flex-col items-center rounded-md border px-2 py-1.5 transition-all duration-300",
                        palette.chipBorder,
                        palette.chipBg,
                        active && cn(palette.chipBorderActive, palette.chipGlow),
                      )}
                    >
                      <span className={cn("font-mono text-lg font-semibold tabular-nums", palette.value)}>
                        {typeof value === "number" ? <AnimatedStat value={value} /> : "—"}
                      </span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">
                        {chip}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-white/45">{hint}</p>
                  <p className={cn("mt-2 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100", palette.link)}>
                    View list →
                  </p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStatCard label="Contacts" value={stats?.totalContacts} chip="people" tone="cyan" />
        <SummaryStatCard label="Companies" value={stats?.totalCompanies} chip="orgs" tone="violet" />
        <SummaryStatCard label="Open reminders" value={stats?.openReminders} chip="open" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent outreach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ListFilters
              className="mb-0"
              onSubmit={() => {
                loadRecent().catch(() => {})
              }}
            >
              <SearchFilter
                value={outreachQ}
                onChange={setOutreachQ}
                placeholder="Subject or body"
                className="min-w-0 flex-1"
              />
              <FilterField label="Status" className="w-36">
                <StatusSelect
                  value={outreachStatus}
                  allowAll
                  onChange={(v) => {
                    setOutreachStatus(v)
                    loadRecent(v, outreachQ).catch(() => {})
                  }}
                />
              </FilterField>
              <ApplyFiltersButton />
            </ListFilters>
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
          <CardContent className="space-y-4">
            <ListFilters className="mb-0">
              <ToggleFilter
                label="Show"
                value={remindersOpen ? "open" : "all"}
                options={[
                  { value: "open", label: "Open" },
                  { value: "all", label: "All" },
                ]}
                onChange={(v) => {
                  const nextOpen = v === "open"
                  setRemindersOpen(nextOpen)
                  loadReminders(nextOpen).catch(() => {})
                }}
              />
            </ListFilters>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open reminders.</p>
            ) : (
              reminders.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{r.notes || REMINDER_KIND_LABEL[r.kind]}</p>
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

function SummaryStatCard({
  label,
  value,
  chip,
  tone,
}: {
  label: string
  value?: number
  chip: string
  tone: MetricPalette
}) {
  const palette = METRIC_PALETTE[tone]
  return (
    <Card
      className={cn(
        "group border border-white/10 transition-all duration-300 hover:-translate-y-0.5",
        palette.cardBorder,
        palette.glow,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-white/70">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <p className={cn("font-heading text-3xl font-semibold tabular-nums", palette.value)}>
            {typeof value === "number" ? <AnimatedStat value={value} /> : "—"}
          </p>
          <div
            className={cn(
              "rounded-md border px-2 py-1 text-center transition-colors",
              palette.chipBorder,
              palette.chipBg,
              palette.chipHover,
            )}
          >
            <span className={cn("font-mono text-sm font-semibold", palette.value)}>
              {typeof value === "number" ? <AnimatedStat value={value} /> : "—"}
            </span>
            <p className="text-[10px] uppercase tracking-wider text-white/40">{chip}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
