import { useState } from "react"

export function useListPage() {
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  function resetPage() {
    setPage(0)
  }

  return { page, setPage, total, setTotal, resetPage }
}
