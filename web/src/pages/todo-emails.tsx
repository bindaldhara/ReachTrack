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
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/hooks/use-auth"
import { listQuery } from "@/lib/list-query"
import type { TodoEmail } from "@/lib/types"

const empty = { subject: "", recipient: "", notes: "" }

export function TodoEmailsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<TodoEmail[]>([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TodoEmail | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined })
    const rows = await request<TodoEmail[]>(`/api/v1/todo/emails${qs}`)
    setItems(rows)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request])

  function startCreate() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function startEdit(item: TodoEmail) {
    setEditing(item)
    setForm({ subject: item.subject, recipient: item.recipient, notes: item.notes })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const body = JSON.stringify(form)
      if (editing) await request(`/api/v1/todo/emails/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/todo/emails", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function markDone(id: string) {
    try {
      await request(`/api/v1/todo/emails/${id}/complete`, { method: "POST" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark done")
    }
  }

  return (
    <div>
      <PageHeader
        title="Emails to send"
        description="Draft outreach emails. Mark done when sent — the item is removed from your list."
        action={<Button onClick={startCreate}>Add email</Button>}
      />
      <ListFilters
        onSubmit={() => {
          load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Subject, recipient, or notes" />
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No emails in your todo list.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.subject || "—"}</TableCell>
                <TableCell>
                  {item.recipient ? (
                    <a href={`mailto:${item.recipient}`} className="text-primary hover:underline">
                      {item.recipient}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {item.notes || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={() => markDone(item.id)}>
                    Done
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
            <DialogTitle>{editing ? "Edit email todo" : "New email todo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Subject">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Recipient">
              <Input
                type="email"
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Notes / draft">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
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
