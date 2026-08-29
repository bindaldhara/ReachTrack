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
import { Textarea } from "@/components/ui/textarea"
import { Field, RelatedSelect, StatusSelect } from "@/components/fields"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import type { Company, Job } from "@/lib/types"

const empty = { title: "", url: "", location: "", status: "sent", notes: "", companyId: "" }

export function JobsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Job[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [status, setStatus] = useState("all")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(nextStatus = status) {
    const qs = nextStatus !== "all" ? `?status=${nextStatus}` : ""
    const [jobs, cos] = await Promise.all([
      request<Job[]>(`/api/v1/jobs${qs}`),
      request<Company[]>("/api/v1/companies"),
    ])
    setItems(jobs)
    setCompanies(cos)
  }

  useEffect(() => {
    load("all").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request])

  function startCreate() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function startEdit(j: Job) {
    setEditing(j)
    setForm({
      title: j.title,
      url: j.url ?? "",
      location: j.location,
      status: j.status,
      notes: j.notes,
      companyId: j.companyId ?? "",
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const body = JSON.stringify(form)
      if (editing) await request(`/api/v1/jobs/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/jobs", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this job?")) return
    try {
      await request(`/api/v1/jobs/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—"

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Roles you are applying to, with the same pipeline statuses."
        action={<Button onClick={startCreate}>Add job</Button>}
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
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No jobs yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">{j.title}</TableCell>
                <TableCell>{companyName(j.companyId)}</TableCell>
                <TableCell>
                  <StatusBadge status={j.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(j)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(j.id)}>
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
            <DialogTitle>{editing ? "Edit job" : "New job"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Company">
              <RelatedSelect
                value={form.companyId}
                onChange={(companyId) => setForm({ ...form, companyId })}
                options={companies.map((c) => ({ id: c.id, label: c.name }))}
                placeholder="Company"
              />
            </Field>
            <Field label="URL">
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <StatusSelect value={form.status} onChange={(status) => setForm({ ...form, status })} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
