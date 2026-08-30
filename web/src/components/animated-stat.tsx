import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function AnimatedStat({
  value,
  className,
}: {
  value: number | string
  className?: string
}) {
  const numeric = typeof value === "number" ? value : null
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    if (numeric === null) {
      setDisplay(value)
      return
    }

    const start = performance.now()
    const duration = 600

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setDisplay(Math.round(numeric * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [numeric, value])

  return (
    <span className={cn("tabular-nums", className)}>
      {display}
    </span>
  )
}
