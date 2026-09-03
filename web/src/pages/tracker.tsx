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
import { Field } from "@/components/fields"
import { ApplyFiltersButton, ListFilters, SearchFilter } from "@/components/list-filters"
import { ListPagination } from "@/components/list-pagination"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/hooks/use-auth"
import { useListPage } from "@/hooks/use-list-page"
import { listQuery } from "@/lib/list-query"
import { paginationParams } from "@/lib/pagination"
import { formatDate, type PaginatedList, type TrackerEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

const PLATFORMS = ["YC", "Wellfound", "LinkedIn", "Hacker News", "Company site", "Other"] as const

const emptyForm = {
  companyName: "",
  appliedPlatform: "",
  appliedDate: "",
  jobUrl: "",
  linkedinConnected: false,
  linkedinNotes: "",
  emailConnected: false,
  emailNotes: "",
  notes: "",
}

export function TrackerPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<TrackerEntry[]>([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TrackerEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const { page, setPage, total, setTotal } = useListPage()

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined, ...paginationParams(page) })
    const rows = await request<PaginatedList<TrackerEntry>>(`/api/v1/tracker${qs}`)
    setItems(rows.items)
    setTotal(rows.total)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, page])

  function startCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function startEdit(item: TrackerEntry) {
    setEditing(item)
    setForm({
      companyName: item.companyName,
      appliedPlatform: item.appliedPlatform,
      appliedDate: item.appliedAt ? item.appliedAt.slice(0, 10) : "",
      jobUrl: item.jobUrl ?? "",
      linkedinConnected: item.linkedinConnected,
      linkedinNotes: item.linkedinNotes,
      emailConnected: item.emailConnected,
      emailNotes: item.emailNotes,
      notes: item.notes,
    })
    setOpen(true)
  }

  async function save() {
    if (!form.companyName.trim()) {
      toast.error("Company name is required")
      return
    }
    setBusy(true)
    try {
      const payload = {
        companyName: form.companyName.trim(),
        appliedPlatform: form.appliedPlatform.trim(),
        appliedAt: form.appliedDate ? `${form.appliedDate}T12:00:00.000Z` : "",
        jobUrl: form.jobUrl.trim(),
        linkedinConnected: form.linkedinConnected,
        linkedinNotes: form.linkedinNotes.trim(),
        emailConnected: form.emailConnected,
        emailNotes: form.emailNotes.trim(),
        notes: form.notes.trim(),
      }
      const body = JSON.stringify(payload)
      if (editing) await request(`/api/v1/tracker/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/tracker", { method: "POST", body })
      setOpen(false)
      await load()
      toast.success(editing ? "Entry updated" : "Entry added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tracker entry?")) return
    try {
      await request(`/api/v1/tracker/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div>
      <PageHeader
        title="Tracker"
        description="Manually log where you applied (YC, Wellfound, etc.), LinkedIn connections, and email outreach."
        action={<Button onClick={startCreate}>Add entry</Button>}
      />
      <ListFilters
        onSubmit={() => {
          if (page !== 0) setPage(0)
          else load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Company, platform, or notes" />
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Job link</TableHead>
            <TableHead>LinkedIn</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No entries yet. Click <strong>Add entry</strong> to log an application on YC, Wellfound, or
                anywhere else.
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.companyName}</TableCell>
                <TableCell>
                  <AppliedCell platform={row.appliedPlatform} appliedAt={row.appliedAt} />
                </TableCell>
                <TableCell>
                  <JobLinkCell url={row.jobUrl} />
                </TableCell>
                <TableCell>
                  <ConnectionCell connected={row.linkedinConnected} notes={row.linkedinNotes} />
                </TableCell>
                <TableCell>
                  <ConnectionCell connected={row.emailConnected} notes={row.emailNotes} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(row.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ListPagination total={total} page={page} onPageChange={setPage} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tracker entry" : "New tracker entry"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Company">
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="Acme Inc."
              />
            </Field>
            <Field label="Applied on (platform)">
              <Input
                list="tracker-platforms"
                value={form.appliedPlatform}
                onChange={(e) => setForm({ ...form, appliedPlatform: e.target.value })}
                placeholder="YC, Wellfound, LinkedIn…"
              />
              <datalist id="tracker-platforms">
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform} />
                ))}
              </datalist>
            </Field>
            <Field label="Applied date (optional)">
              <Input
                type="date"
                value={form.appliedDate}
                onChange={(e) => setForm({ ...form, appliedDate: e.target.value })}
              />
            </Field>
            <Field label="Job link (optional)">
              <Input
                type="url"
                value={form.jobUrl}
                onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            <Field label="LinkedIn">
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.linkedinConnected}
                  onChange={(e) => setForm({ ...form, linkedinConnected: e.target.checked })}
                  className="size-4 rounded border-input accent-primary"
                />
                Connected on LinkedIn
              </label>
              <Textarea
                value={form.linkedinNotes}
                onChange={(e) => setForm({ ...form, linkedinNotes: e.target.value })}
                placeholder="Who you connected with, followed, or messaged"
                rows={2}
              />
            </Field>
            <Field label="Email">
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.emailConnected}
                  onChange={(e) => setForm({ ...form, emailConnected: e.target.checked })}
                  className="size-4 rounded border-input accent-primary"
                />
                Reached out by email
              </label>
              <Textarea
                value={form.emailNotes}
                onChange={(e) => setForm({ ...form, emailNotes: e.target.value })}
                placeholder="Who you emailed and any reply notes"
                rows={2}
              />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
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

function AppliedCell({ platform, appliedAt }: { platform: string; appliedAt: string | null }) {
  if (!platform && !appliedAt) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      {platform ? <span>{platform}</span> : null}
      {appliedAt ? (
        <span className="text-xs text-muted-foreground">{formatDate(appliedAt)}</span>
      ) : null}
    </div>
  )
}

function JobLinkCell({ url }: { url: string | null }) {
  if (!url?.trim()) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      Open
    </a>
  )
}

function ConnectionCell({ connected, notes }: { connected: boolean; notes: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium",
          connected
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {connected ? "Yes" : "Not yet"}
      </span>
      {notes ? <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{notes}</span> : null}
    </div>
  )
}
