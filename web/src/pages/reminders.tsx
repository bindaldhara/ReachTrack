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
import { Field, KindSelect, RelatedSelect } from "@/components/fields"
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter, ToggleFilter } from "@/components/list-filters"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/hooks/use-auth"
import { listQuery } from "@/lib/list-query"
import { REMINDER_KIND_LABEL } from "@/lib/labels"
import {
  formatDate,
  fromLocalInput,
  toLocalInput,
  type OutreachEvent,
  type Reminder,
} from "@/lib/types"

const empty = {
  kind: "follow_up",
  dueAt: toLocalInput(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()),
  notes: "",
  outreachEventId: "",
  completed: false,
}

export function RemindersPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Reminder[]>([])
  const [events, setEvents] = useState<OutreachEvent[]>([])
  const [openOnly, setOpenOnly] = useState(true)
  const [kind, setKind] = useState("all")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(nextOpen = openOnly, nextKind = kind, search = q) {
    const qs = listQuery({
      open: nextOpen ? "true" : "false",
      kind: nextKind !== "all" ? nextKind : undefined,
      q: search.trim() || undefined,
    })
    const [rows, ev] = await Promise.all([
      request<Reminder[]>(`/api/v1/reminders${qs}`),
      request<OutreachEvent[]>("/api/v1/outreach-events"),
    ])
    setItems(rows)
    setEvents(ev)
  }

  useEffect(() => {
    load(true).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request])

  function startCreate() {
    setEditing(null)
    setForm({
      ...empty,
      dueAt: toLocalInput(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()),
    })
    setOpen(true)
  }

  function startEdit(r: Reminder) {
    setEditing(r)
    setForm({
      kind: r.kind,
      dueAt: toLocalInput(r.dueAt),
      notes: r.notes,
      outreachEventId: r.outreachEventId ?? "",
      completed: Boolean(r.completedAt),
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const payload = {
        ...form,
        dueAt: fromLocalInput(form.dueAt),
      }
      const body = JSON.stringify(payload)
      if (editing) await request(`/api/v1/reminders/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/reminders", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this reminder?")) return
    try {
      await request(`/api/v1/reminders/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div>
      <PageHeader
        title="Reminders"
        description="Follow-ups, replies you owe, and interview deadlines."
        action={<Button onClick={startCreate}>Add reminder</Button>}
      />
      <ListFilters
        onSubmit={() => {
          load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Filter failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Notes" />
        <FilterField label="Kind" className="w-40">
          <KindSelect
            value={kind}
            allowAll
            onChange={(v) => {
              setKind(v)
              load(openOnly, v, q).catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "Filter failed"),
              )
            }}
          />
        </FilterField>
        <ToggleFilter
          label="Status"
          value={openOnly ? "open" : "all"}
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All" },
          ]}
          onChange={(v) => {
            const nextOpen = v === "open"
            setOpenOnly(nextOpen)
            load(nextOpen, kind, q).catch((err: unknown) =>
              toast.error(err instanceof Error ? err.message : "Filter failed"),
            )
          }}
        />
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Done</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No reminders yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{REMINDER_KIND_LABEL[r.kind]}</TableCell>
                <TableCell>{formatDate(r.dueAt)}</TableCell>
                <TableCell>{r.notes || "—"}</TableCell>
                <TableCell>{r.completedAt ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>
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
            <DialogTitle>{editing ? "Edit reminder" : "New reminder"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Kind">
              <KindSelect value={form.kind} onChange={(kind) => setForm({ ...form, kind })} />
            </Field>
            <Field label="Due at">
              <Input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Field label="Outreach event">
              <RelatedSelect
                value={form.outreachEventId}
                onChange={(outreachEventId) => setForm({ ...form, outreachEventId })}
                options={events.map((e) => ({ id: e.id, label: e.subject || "Untitled" }))}
                placeholder="Outreach event"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.completed}
                onChange={(e) => setForm({ ...form, completed: e.target.checked })}
              />
              Completed
            </label>
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
