import { Fragment, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusSelect } from "@/components/fields"
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter, ToggleFilter } from "@/components/list-filters"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { outreachEmailUrl } from "@/lib/gmail"
import { APPLICATION_CONFIRMATION_CHANNELS } from "@/lib/outreach-filters"
import { CHANNEL_LABEL } from "@/lib/labels"
import { listQuery } from "@/lib/list-query"
import { formatDate, type Company, type Job, type OutreachEvent } from "@/lib/types"

export function SuccessfullyAppliedPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<OutreachEvent[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [status, setStatus] = useState("all")
  const [q, setQ] = useState("")
  const [rejectionsOnly, setRejectionsOnly] = useState(false)

  async function load(nextStatus = status, search = q, onlyRejections = rejectionsOnly) {
    const qs = listQuery({
      channels: APPLICATION_CONFIRMATION_CHANNELS.join(","),
      type: "application",
      status: nextStatus !== "all" ? nextStatus : undefined,
      q: search.trim() || undefined,
      statusSuggestion: onlyRejections ? "rejected" : undefined,
    })
    const [rows, cos, js] = await Promise.all([
      request<OutreachEvent[]>(`/api/v1/outreach-events${qs}`),
      request<Company[]>("/api/v1/companies"),
      request<Job[]>("/api/v1/jobs"),
    ])
    setItems(rows)
    setCompanies(cos)
    setJobs(js)
  }

  useEffect(() => {
    load("all", "", false).catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Load failed"),
    )
  }, [request])

  async function confirmRejection(id: string) {
    if (!confirm("Mark this application as rejected?")) return
    try {
      await request(`/api/v1/outreach-events/${id}/confirm-suggestion`, { method: "POST" })
      toast.success("Marked as rejected")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm rejection")
    }
  }

  async function dismissSuggestion(id: string) {
    try {
      await request(`/api/v1/outreach-events/${id}/dismiss-suggestion`, { method: "POST" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not dismiss suggestion")
    }
  }

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—"
  const jobTitle = (id: string | null) => jobs.find((j) => j.id === id)?.title

  return (
    <div>
      <PageHeader
        title="Successfully applied"
        description="Application confirmations from company career sites and LinkedIn Easy Apply. Imported from Gmail — no follow-up needed."
        action={
          <Button variant="outline" asChild>
            <Link to="/jobs">View jobs</Link>
          </Button>
        }
      />
      <ListFilters
        onSubmit={() => {
          load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Filter failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Application subject" />
        <FilterField label="Status" className="w-40">
          <StatusSelect
            value={status}
            allowAll
            onChange={(v) => {
              setStatus(v)
              load(v, q, rejectionsOnly).catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "Filter failed"),
              )
            }}
          />
        </FilterField>
        <ToggleFilter
          label="Suggestions"
          value={rejectionsOnly ? "rejections" : "all"}
          options={[
            { value: "all", label: "All" },
            { value: "rejections", label: "Possible rejections" },
          ]}
          onChange={(v) => {
            const only = v === "rejections"
            setRejectionsOnly(only)
            load(status, q, only).catch((err: unknown) =>
              toast.error(err instanceof Error ? err.message : "Filter failed"),
            )
          }}
        />
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Applied</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No applications yet.{" "}
                <Link to="/profile" className="text-primary underline underline-offset-2">
                  Import Gmail
                </Link>{" "}
                for dates when you applied on career sites or LinkedIn.
              </TableCell>
            </TableRow>
          ) : (
            items.map((e) => (
              <Fragment key={e.id}>
                <TableRow>
                  <TableCell className="font-medium">
                    <AppliedSubject event={e} jobTitle={jobTitle(e.jobId)} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CHANNEL_LABEL[e.channel]}
                  </TableCell>
                  <TableCell>{companyName(e.companyId)}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(e.occurredAt)}
                  </TableCell>
                </TableRow>
                {e.statusSuggestion === "rejected" ? (
                  <TableRow className="bg-amber-500/5 hover:bg-amber-500/5">
                    <TableCell colSpan={5} className="py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                          This reply may be a rejection. Mark it as rejected?
                        </p>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button size="sm" onClick={() => confirmRejection(e.id)}>
                            Mark rejected
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => dismissSuggestion(e.id)}>
                            Not a rejection
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function AppliedSubject({ event, jobTitle }: { event: OutreachEvent; jobTitle?: string }) {
  const label = jobTitle || event.subject
  const href = outreachEmailUrl(event)
  if (!href) return label
  return (
    <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
      {label}
    </a>
  )
}