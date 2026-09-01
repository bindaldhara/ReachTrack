import { Button } from "@/components/ui/button"
import { PAGE_SIZE, pageRangeLabel } from "@/lib/pagination"

export function ListPagination({
  total,
  page,
  pageSize = PAGE_SIZE,
  onPageChange,
}: {
  total: number
  page: number
  pageSize?: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null

  return (
    <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{pageRangeLabel(page, total, pageSize)}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-[5rem] text-center text-sm text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
