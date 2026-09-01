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
import { ListPagination } from "@/components/list-pagination"
import { useAuth } from "@/hooks/use-auth"
import { useListPage } from "@/hooks/use-list-page"
import { useTodoSelection } from "@/hooks/use-todo-selection"
import { listQuery } from "@/lib/list-query"
import { paginationParams } from "@/lib/pagination"
import type { PaginatedList, TodoEmail } from "@/lib/types"
import { cn } from "@/lib/utils"

const empty = { subject: "", recipient: "", notes: "" }

export function TodoEmailsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<TodoEmail[]>([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TodoEmail | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const { page, setPage, total, setTotal } = useListPage()

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined, ...paginationParams(page) })
    const rows = await request<PaginatedList<TodoEmail>>(`/api/v1/todo/emails${qs}`)
    setItems(rows.items)
    setTotal(rows.total)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, page])

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

  const itemIds = items.map((item) => item.id)
  const { selected, toggle, toggleAll, clear, count, allSelected, someSelected } = useTodoSelection(itemIds)

  async function markSelectedDone() {
    if (count === 0) return
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => request(`/api/v1/todo/emails/${id}/complete`, { method: "POST" })))
      clear()
      await load()
      toast.success(`Marked ${ids.length} ${ids.length === 1 ? "email" : "emails"} as done`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark selected as done")
      await load()
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
          if (page !== 0) setPage(0)
          else load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Subject, recipient, or notes" />
        <ApplyFiltersButton />
        {count > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{count} selected</span>
            <Button size="sm" onClick={markSelectedDone}>
              Mark as done
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          </>
        ) : null}
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                role="checkbox"
                aria-label="Select all emails"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={toggleAll}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No emails in your todo list.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow
                key={item.id}
                className={cn(selected.has(item.id) && "bg-muted/40")}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    role="checkbox"
                    aria-label={`Select ${item.subject || "email"}`}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                </TableCell>
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
      <ListPagination total={total} page={page} onPageChange={setPage} />
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
