import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "reachtrack-sidebar-width"
const MIN_WIDTH = 200
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 240

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDTH
    const n = Number.parseInt(raw, 10)
    if (Number.isNaN(n)) return DEFAULT_WIDTH
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n))
  } catch {
    return DEFAULT_WIDTH
  }
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(readStoredWidth)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width))
  }, [width])

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width

      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + moveEvent.clientX - startX
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
      }

      const onUp = () => {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [width],
  )

  return { width, onResizeStart, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }
}
