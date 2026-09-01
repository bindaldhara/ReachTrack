import { Fragment, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ChannelSelect, Field, RelatedSelect, SourceSelect, StatusSelect, TypeSelect } from "@/components/fields"
import { PageHeader } from "@/components/page-header"
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter } from "@/components/list-filters"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { useAuth } from "@/hooks/use-auth"
import { CHANNEL_LABEL, TYPE_LABEL } from "@/lib/labels"
import { paginationParams, fetchSelectPage } from "@/lib/pagination"
import {
  filtersFromParams,
  outreachFilterLabel,
  outreachListQuery,
} from "@/lib/outreach-filters"
import { outreachEmailUrl } from "@/lib/gmail"
import {
  contactName,
  formatDate,
  fromLocalInput,
  toLocalInput,
  type Company,
  type Contact,
  type Job,
  type OutreachEvent,
  type PaginatedList,
} from "@/lib/types"

const empty = {
  subject: "",
  body: "",
  type: "cold_email",
  channel: "other",
  source: "manual",
  status: "sent",
  occurredAt: toLocalInput(new Date().toISOString()),
  contactId: "",
  companyId: "",
  jobId: "",
}

export function OutreachPage() {
  const { request } = useAuth()
  const [params, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<OutreachEvent[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const filters = useMemo(() => filtersFromParams(params), [params])
  const [status, setStatus] = useState(params.get("status") || "all")
  const [type, setType] = useState(params.get("type") || "all")
  const [channel, setChannel] = useState(params.get("channel") || "all")
  const [searchDraft, setSearchDraft] = useState(params.get("q") || "")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<OutreachEvent | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(0)
  const page = Math.max(0, Number(params.get("page") || "0") || 0)
  const hasListFilter = Boolean(
    filters.types?.length ||
      filters.type ||
      filters.status ||
      filters.statusSuggestion ||
      filters.channel ||
      filters.q,
  )
  const filterLabel = outreachFilterLabel(filters)

  async function load() {
    const pag = paginationParams(page)
    const qs = outreachListQuery({ ...filters, limit: pag.limit, offset: pag.offset })
    const [data, cts, cos, js] = await Promise.all([
      request<PaginatedList<OutreachEvent>>(`/api/v1/outreach-events${qs}`),
      request<PaginatedList<Contact>>(fetchSelectPage("/api/v1/contacts")),
      request<PaginatedList<Company>>(fetchSelectPage("/api/v1/companies")),
      request<PaginatedList<Job>>(fetchSelectPage("/api/v1/jobs")),
    ])
    setItems(data.items)
    setTotal(data.total)
    setContacts(cts.items)
    setCompanies(cos.items)
    setJobs(js.items)
  }

  useEffect(() => {
    setStatus(params.get("status") || "all")
    setType(params.get("type") || "all")
    setChannel(params.get("channel") || "all")
    setSearchDraft(params.get("q") || "")
    load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, params])

  function setPage(next: number) {
    const nextParams = new URLSearchParams(params)
    if (next <= 0) nextParams.delete("page")
    else nextParams.set("page", String(next))
    setSearchParams(nextParams)
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value === "all" || !value) next.delete(key)
    else next.set(key, value)
    if (key === "type" && value !== "all") next.delete("types")
    next.delete("page")
    setSearchParams(next)
  }

  function updateStatus(nextStatus: string) {
    setStatus(nextStatus)
    updateParam("status", nextStatus)
  }

  function applySearch() {
    const next = new URLSearchParams(params)
    if (searchDraft.trim()) next.set("q", searchDraft.trim())
    else next.delete("q")
    next.delete("page")
    setSearchParams(next)
  }

  function startCreate() {
    setEditing(null)
    setForm({ ...empty, occurredAt: toLocalInput(new Date().toISOString()) })
    setOpen(true)
  }

  function startEdit(e: OutreachEvent) {
    setEditing(e)
    setForm({
      subject: e.subject,
      body: e.body,
      type: e.type,
      channel: e.channel,
      source: e.source,
      status: e.status,
      occurredAt: toLocalInput(e.occurredAt),
      contactId: e.contactId ?? "",
      companyId: e.companyId ?? "",
      jobId: e.jobId ?? "",
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const payload = { ...form, occurredAt: fromLocalInput(form.occurredAt) }
      const body = JSON.stringify(payload)
      if (editing) await request(`/api/v1/outreach-events/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/outreach-events", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this outreach event?")) return
    try {
      await request(`/api/v1/outreach-events/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  async function confirmRejection(id: string) {
    if (!confirm("Mark this outreach as rejected?")) return
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

  return (
    <div>
      <PageHeader
        title="Outreach"
        description="Each captured action: cold email, referral, LinkedIn DM, reply, or application."
        action={<Button onClick={startCreate}>Log outreach</Button>}
      />
      {hasListFilter ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing:</span>
          <span className="rounded-md bg-muted px-2 py-1 font-medium">{filterLabel}</span>
          <Link to="/outreach" className="text-primary underline underline-offset-2">
            Clear filter
          </Link>
        </div>
      ) : null}
      <ListFilters onSubmit={applySearch}>
        <SearchFilter
          value={searchDraft}
          onChange={setSearchDraft}
          placeholder="Subject or body"
        />
        <FilterField label="Status" className="w-40">
          <StatusSelect
            value={status}
            allowAll
            onChange={(v) => {
              updateStatus(v)
            }}
          />
        </FilterField>
        <FilterField label="Type" className="w-44">
          <TypeSelect
            value={type}
            allowAll
            onChange={(v) => {
              setType(v)
              updateParam("type", v)
            }}
          />
        </FilterField>
        <FilterField label="Channel" className="w-40">
          <ChannelSelect
            value={channel}
            allowAll
            onChange={(v) => {
              setChannel(v)
              updateParam("channel", v)
            }}
          />
        </FilterField>
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>When</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No outreach events match this filter.
              </TableCell>
            </TableRow>
          ) : (
            items.map((e) => (
              <Fragment key={e.id}>
                <TableRow>
                  <TableCell className="font-medium">
                    <OutreachSubject event={e} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CHANNEL_LABEL[e.channel]}
                  </TableCell>
                  <TableCell>{TYPE_LABEL[e.type]}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(e.occurredAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(e)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(e.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
                {e.statusSuggestion === "rejected" ? (
                  <TableRow key={`${e.id}-suggestion`} className="bg-amber-500/5 hover:bg-amber-500/5">
                    <TableCell colSpan={6} className="py-3">
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
      <ListPagination total={total} page={page} onPageChange={setPage} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit outreach" : "Log outreach"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Subject">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Body">
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <TypeSelect value={form.type} onChange={(type) => setForm({ ...form, type })} />
              </Field>
              <Field label="Status">
                <StatusSelect value={form.status} onChange={(status) => setForm({ ...form, status })} />
              </Field>
              <Field label="Channel">
                <ChannelSelect value={form.channel} onChange={(channel) => setForm({ ...form, channel })} />
              </Field>
              <Field label="Source">
                <SourceSelect value={form.source} onChange={(source) => setForm({ ...form, source })} />
              </Field>
            </div>
            <Field label="Occurred at">
              <Input
                type="datetime-local"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
              />
            </Field>
            <Field label="Contact">
              <RelatedSelect
                value={form.contactId}
                onChange={(contactId) => setForm({ ...form, contactId })}
                options={contacts.map((c) => ({ id: c.id, label: contactName(c) }))}
                placeholder="Contact"
              />
            </Field>
            <Field label="Company">
              <RelatedSelect
                value={form.companyId}
                onChange={(companyId) => setForm({ ...form, companyId })}
                options={companies.map((c) => ({ id: c.id, label: c.name }))}
                placeholder="Company"
              />
            </Field>
            <Field label="Job">
              <RelatedSelect
                value={form.jobId}
                onChange={(jobId) => setForm({ ...form, jobId })}
                options={jobs.map((j) => ({ id: j.id, label: j.title }))}
                placeholder="Job"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OutreachSubject({ event }: { event: OutreachEvent }) {
  const title = event.subject || "Untitled"
  const url = outreachEmailUrl(event)
  if (!url) return title
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:underline"
      title="Open in Gmail"
    >
      {title}
    </a>
  )
}
