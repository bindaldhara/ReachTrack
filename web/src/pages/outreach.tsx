import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
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
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { TYPE_LABEL } from "@/lib/labels"
import {
  contactName,
  formatDate,
  fromLocalInput,
  toLocalInput,
  type Company,
  type Contact,
  type Conversation,
  type Job,
  type OutreachEvent,
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
  conversationId: "",
}

export function OutreachPage() {
  const { request } = useAuth()
  const [params] = useSearchParams()
  const [items, setItems] = useState<OutreachEvent[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [status, setStatus] = useState(params.get("status") || "all")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<OutreachEvent | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(nextStatus = status) {
    const qs = nextStatus !== "all" ? `?status=${nextStatus}` : ""
    const [rows, cts, cos, js, convos] = await Promise.all([
      request<OutreachEvent[]>(`/api/v1/outreach-events${qs}`),
      request<Contact[]>("/api/v1/contacts"),
      request<Company[]>("/api/v1/companies"),
      request<Job[]>("/api/v1/jobs"),
      request<Conversation[]>("/api/v1/conversations"),
    ])
    setItems(rows)
    setContacts(cts)
    setCompanies(cos)
    setJobs(js)
    setConversations(convos)
  }

  useEffect(() => {
    const initial = params.get("status") || "all"
    setStatus(initial)
    load(initial).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, params])

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
      conversationId: e.conversationId ?? "",
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

  return (
    <div>
      <PageHeader
        title="Outreach"
        description="Each captured action: cold email, referral, LinkedIn DM, reply, or application."
        action={<Button onClick={startCreate}>Log outreach</Button>}
      />
      <div className="mb-4 max-w-xs">
        <StatusSelect
          value={status}
          allowAll
          onChange={(v) => {
            setStatus(v)
            load(v).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Filter failed"))
          }}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>When</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No outreach events yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.subject || "Untitled"}</TableCell>
                <TableCell>{TYPE_LABEL[e.type]}</TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell>{formatDate(e.occurredAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(e)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(e.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
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
            <Field label="Conversation">
              <RelatedSelect
                value={form.conversationId}
                onChange={(conversationId) => setForm({ ...form, conversationId })}
                options={conversations.map((c) => ({ id: c.id, label: c.subject || "Untitled thread" }))}
                placeholder="Conversation"
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
