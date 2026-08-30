import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
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
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter } from "@/components/list-filters"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useAuth } from "@/hooks/use-auth"
import { listQuery } from "@/lib/list-query"
import { formatDate } from "@/lib/types"
import type { Company, Job } from "@/lib/types"

const empty = { title: "", url: "", location: "", status: "sent", notes: "", companyId: "" }

function isImportedJob(job: Job) {
  return job.notes.toLowerCase().includes("imported from")
}

export function JobsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Job[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [status, setStatus] = useState("all")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(nextStatus = status, search = q) {
    const qs = listQuery({
      status: nextStatus !== "all" ? nextStatus : undefined,
      q: search.trim() || undefined,
    })
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
        description="Roles you applied to. Careers-page confirmations from Gmail are added automatically on import."
        action={<Button onClick={startCreate}>Add job</Button>}
      />
      <ListFilters
        onSubmit={() => {
          load(status, q).catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Filter failed"),
          )
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Title or location" />
        <FilterField label="Status" className="w-40">
          <StatusSelect
            value={status}
            allowAll
            onChange={(v) => {
              setStatus(v)
              load(v, q).catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "Filter failed"),
              )
            }}
          />
        </FilterField>
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No jobs yet. Import Gmail for a date to pull in careers-page applications.
              </TableCell>
            </TableRow>
          ) : (
            items.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    {j.url ? (
                      <a
                        href={j.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {j.title}
                        <ExternalLink className="size-3.5 shrink-0 opacity-70" />
                      </a>
                    ) : (
                      j.title
                    )}
                    {isImportedJob(j) ? (
                      <p className="text-xs text-muted-foreground">From Gmail careers confirmation</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{companyName(j.companyId)}</TableCell>
                <TableCell className="text-muted-foreground">{j.location || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={j.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(j.createdAt)}
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
