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
import { Field, RelatedSelect } from "@/components/fields"
import { ApplyFiltersButton, ListFilters, SearchFilter } from "@/components/list-filters"
import { PageHeader } from "@/components/page-header"
import { ListPagination } from "@/components/list-pagination"
import { useAuth } from "@/hooks/use-auth"
import { useListPage } from "@/hooks/use-list-page"
import { useTodoSelection } from "@/hooks/use-todo-selection"
import { listQuery } from "@/lib/list-query"
import { fetchSelectPage, paginationParams } from "@/lib/pagination"
import type { Company, PaginatedList, TodoCompany } from "@/lib/types"
import { cn } from "@/lib/utils"

const empty = { name: "", notes: "", companyId: "" }

export function TodoCompaniesPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<TodoCompany[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TodoCompany | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const { page, setPage, total, setTotal } = useListPage()

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined, ...paginationParams(page) })
    const [rows, cos] = await Promise.all([
      request<PaginatedList<TodoCompany>>(`/api/v1/todo/companies${qs}`),
      request<PaginatedList<Company>>(fetchSelectPage("/api/v1/companies")),
    ])
    setItems(rows.items)
    setTotal(rows.total)
    setCompanies(cos.items)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, page])

  function startCreate() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function startEdit(item: TodoCompany) {
    setEditing(item)
    setForm({
      name: item.name,
      notes: item.notes,
      companyId: item.companyId ?? "",
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const body = JSON.stringify(form)
      if (editing) await request(`/api/v1/todo/companies/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/todo/companies", { method: "POST", body })
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
      await request(`/api/v1/todo/companies/${id}/complete`, { method: "POST" })
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
      await Promise.all(ids.map((id) => request(`/api/v1/todo/companies/${id}/complete`, { method: "POST" })))
      clear()
      await load()
      toast.success(`Marked ${ids.length} ${ids.length === 1 ? "company" : "companies"} as done`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark selected as done")
      await load()
    }
  }

  const linkedCompany = (id: string | null) => companies.find((c) => c.id === id)?.name

  return (
    <div>
      <PageHeader
        title="Companies to reach out"
        description="Target companies for outreach. Mark done after you have reached out — the item is removed."
        action={<Button onClick={startCreate}>Add company</Button>}
      />
      <ListFilters
        onSubmit={() => {
          if (page !== 0) setPage(0)
          else load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Company name or notes" />
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
                aria-label="Select all companies"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={toggleAll}
                className="size-4 rounded border-input accent-primary"
              />
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Linked record</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No companies in your outreach todo list.
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
                    aria-label={`Select ${item.name}`}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {linkedCompany(item.companyId) ?? "—"}
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
            <DialogTitle>{editing ? "Edit company todo" : "New company todo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Company name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Link to existing company (optional)">
              <RelatedSelect
                value={form.companyId}
                onChange={(companyId) => setForm({ ...form, companyId })}
                options={companies.map((c) => ({ id: c.id, label: c.name }))}
                placeholder="Company"
                allowAllLabel="None"
              />
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
