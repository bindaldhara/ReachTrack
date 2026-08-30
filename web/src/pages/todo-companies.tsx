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
import { useAuth } from "@/hooks/use-auth"
import { listQuery } from "@/lib/list-query"
import type { Company, TodoCompany } from "@/lib/types"

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

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined })
    const [rows, cos] = await Promise.all([
      request<TodoCompany[]>(`/api/v1/todo/companies${qs}`),
      request<Company[]>("/api/v1/companies"),
    ])
    setItems(rows)
    setCompanies(cos)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request])

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
          load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Company name or notes" />
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Linked record</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No companies in your outreach todo list.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
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
