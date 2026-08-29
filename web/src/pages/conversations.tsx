import { useEffect, useState } from "react"
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
import { ChannelSelect, Field, RelatedSelect, StatusSelect } from "@/components/fields"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { CHANNEL_LABEL } from "@/lib/labels"
import { contactName, formatDate, type Company, type Contact, type Conversation, type Job } from "@/lib/types"

const empty = {
  subject: "",
  channel: "other",
  status: "sent",
  contactId: "",
  companyId: "",
  jobId: "",
}

export function ConversationsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Conversation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [status, setStatus] = useState("all")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Conversation | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(nextStatus = status) {
    const qs = nextStatus !== "all" ? `?status=${nextStatus}` : ""
    const [rows, cts, cos, js] = await Promise.all([
      request<Conversation[]>(`/api/v1/conversations${qs}`),
      request<Contact[]>("/api/v1/contacts"),
      request<Company[]>("/api/v1/companies"),
      request<Job[]>("/api/v1/jobs"),
    ])
    setItems(rows)
    setContacts(cts)
    setCompanies(cos)
    setJobs(js)
  }

  useEffect(() => {
    load("all").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request])

  function startCreate() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function startEdit(c: Conversation) {
    setEditing(c)
    setForm({
      subject: c.subject,
      channel: c.channel,
      status: c.status,
      contactId: c.contactId ?? "",
      companyId: c.companyId ?? "",
      jobId: c.jobId ?? "",
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const body = JSON.stringify(form)
      if (editing) await request(`/api/v1/conversations/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/conversations", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this conversation?")) return
    try {
      await request(`/api/v1/conversations/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div>
      <PageHeader
        title="Conversations"
        description="Threads across Gmail, LinkedIn, and careers pages."
        action={<Button onClick={startCreate}>Add conversation</Button>}
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
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last event</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No conversations yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.subject || "Untitled thread"}</TableCell>
                <TableCell>{CHANNEL_LABEL[c.channel]}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>{formatDate(c.lastEventAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit conversation" : "New conversation"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Subject">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Channel">
              <ChannelSelect value={form.channel} onChange={(channel) => setForm({ ...form, channel })} />
            </Field>
            <Field label="Status">
              <StatusSelect value={form.status} onChange={(status) => setForm({ ...form, status })} />
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
