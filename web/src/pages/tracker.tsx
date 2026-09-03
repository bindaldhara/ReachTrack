import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { ApplyFiltersButton, ListFilters, SearchFilter } from "@/components/list-filters"
import { ListPagination } from "@/components/list-pagination"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useListPage } from "@/hooks/use-list-page"
import { outreachEmailUrl } from "@/lib/gmail"
import { listQuery } from "@/lib/list-query"
import { paginationParams } from "@/lib/pagination"
import { formatDate, type PaginatedList, type TrackerRow } from "@/lib/types"

export function TrackerPage() {
  const { request } = useAuth()
  const [items, setItems] = useState<TrackerRow[]>([])
  const [q, setQ] = useState("")
  const { page, setPage, total, setTotal } = useListPage()

  async function load(search = q) {
    const qs = listQuery({ q: search.trim() || undefined, ...paginationParams(page) })
    const rows = await request<PaginatedList<TrackerRow>>(`/api/v1/tracker${qs}`)
    setItems(rows.items)
    setTotal(rows.total)
  }

  useEffect(() => {
    load("").catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Load failed"))
  }, [request, page])

  return (
    <div>
      <PageHeader
        title="Tracker"
        description="One row per company: when you applied, when you emailed, and the latest response."
      />
      <ListFilters
        onSubmit={() => {
          if (page !== 0) setPage(0)
          else load().catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"))
        }}
      >
        <SearchFilter value={q} onChange={setQ} placeholder="Company name" />
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
            <TableHead>Response</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No tracked companies yet.{" "}
                <Link to="/outreach" className="text-primary underline underline-offset-2">
                  Log outreach
                </Link>{" "}
                or{" "}
                <Link to="/successfully-applied" className="text-primary underline underline-offset-2">
                  add an application
                </Link>
                .
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => (
              <TableRow key={row.companyId}>
                <TableCell className="font-medium">{row.companyName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.appliedAt ? formatDate(row.appliedAt) : "—"}
                </TableCell>
                <TableCell>
                  <ExternalLinkCell href={row.jobUrl} label={row.jobTitle || "View job"} />
                </TableCell>
                <TableCell>
                  <ExternalLinkCell href={row.linkedinUrl} label={row.linkedinLabel || "Profile"} />
                </TableCell>
                <TableCell>
                  <EmailCell row={row} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={row.responseStatus} />
                    {row.statusSuggestion === "rejected" ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Possible rejection — review on{" "}
                        <Link to="/outreach" className="underline underline-offset-2">
                          Outreach
                        </Link>
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ListPagination total={total} page={page} onPageChange={setPage} />
    </div>
  )
}

function ExternalLinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href?.trim()) return <span className="text-muted-foreground">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="max-w-[10rem] truncate text-primary hover:underline"
      title={label}
    >
      {label}
    </a>
  )
}

function EmailCell({ row }: { row: TrackerRow }) {
  if (!row.emailAt) return <span className="text-muted-foreground">—</span>

  const href =
    row.emailSource && row.emailExternalId
      ? outreachEmailUrl({ source: row.emailSource, externalId: row.emailExternalId })
      : null
  const label = row.emailSubject || "Email sent"

  return (
    <div className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.emailAt)}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="max-w-xs truncate hover:underline">
          {label}
        </a>
      ) : (
        <span className="max-w-xs truncate">{label}</span>
      )}
    </div>
  )
}
