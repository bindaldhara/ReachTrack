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
import { ApplyFiltersButton, FilterField, ListFilters, SearchFilter } from "@/components/list-filters"
import { PageHeader } from "@/components/page-header"
import { ListPagination } from "@/components/list-pagination"
import { useAuth } from "@/hooks/use-auth"
import { useListPage } from "@/hooks/use-list-page"
import { listQuery } from "@/lib/list-query"
import { fetchSelectPage, paginationParams } from "@/lib/pagination"
import { contactName, type Company, type Contact, type PaginatedList } from "@/lib/types"

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  linkedinUrl: "",
  title: "",
  notes: "",
  companyId: "",
}

export function ContactsPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [q, setQ] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const { page, setPage, total, setTotal } = useListPage()

  async function load(search = q, nextCompanyId = companyId) {
    const qs = listQuery({
      q: search.trim() || undefined,
      companyId: nextCompanyId || undefined,
      ...paginationParams(page),
    })
    const [contacts, cos] = await Promise.all([
      request<PaginatedList<Contact>>(`/api/v1/contacts${qs}`),
      request<PaginatedList<Company>>(fetchSelectPage("/api/v1/companies")),
    ])
    setItems(contacts.items)
    setTotal(contacts.total)
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

  function startEdit(c: Contact) {
    setEditing(c)
    setForm({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? "",
      linkedinUrl: c.linkedinUrl ?? "",
      title: c.title,
      notes: c.notes,
      companyId: c.companyId ?? "",
    })
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const body = JSON.stringify(form)
      if (editing) await request(`/api/v1/contacts/${editing.id}`, { method: "PUT", body })
      else await request("/api/v1/contacts", { method: "POST", body })
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this contact?")) return
    try {
      await request(`/api/v1/contacts/${id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—"

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="People you email, message, or ask for referrals."
        action={<Button onClick={startCreate}>Add contact</Button>}
      />
      <ListFilters
        onSubmit={() => {
          if (page !== 0) setPage(0)
          else load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Name, email, or title" />
        <FilterField label="Company" className="w-48">
          <RelatedSelect
            value={companyId}
            onChange={(id) => {
              setCompanyId(id)
              if (page !== 0) setPage(0)
              else load(q, id).catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "Filter failed"),
              )
            }}
            options={companies.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="Company"
            allowAllLabel="All companies"
          />
        </FilterField>
        <ApplyFiltersButton />
      </ListFilters>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No contacts yet.
              </TableCell>
            </TableRow>
          ) : (
            items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{contactName(c)}</TableCell>
                <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                <TableCell>{c.title || "—"}</TableCell>
                <TableCell>{companyName(c.companyId)}</TableCell>
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
      <ListPagination total={total} page={page} onPageChange={setPage} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact" : "New contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </Field>
            </div>
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
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="LinkedIn URL">
              <Input
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
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
