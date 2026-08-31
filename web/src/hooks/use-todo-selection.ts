import { useEffect, useState } from "react"

export function useTodoSelection(itemIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(itemIds)
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [itemIds])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === itemIds.length ? new Set() : new Set(itemIds)))
  }

  function clear() {
    setSelected(new Set())
  }

  const count = selected.size
  const allSelected = itemIds.length > 0 && count === itemIds.length
  const someSelected = count > 0 && !allSelected

  return { selected, toggle, toggleAll, clear, count, allSelected, someSelected }
}
