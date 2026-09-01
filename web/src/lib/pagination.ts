export const PAGE_SIZE = 25
export const SELECT_PAGE_SIZE = 200

export function paginationParams(page: number, pageSize = PAGE_SIZE) {
  return {
    limit: String(pageSize),
    offset: String(page * pageSize),
  }
}

export function pageRangeLabel(page: number, total: number, pageSize = PAGE_SIZE) {
  if (total === 0) return "No results"
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)
  return `Showing ${start}–${end} of ${total}`
}

export function fetchSelectPage(path: string, pageSize = SELECT_PAGE_SIZE) {
  return `${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=0`
}
