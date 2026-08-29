export const FIRST_MAIL_TYPES = ["cold_email", "referral_request", "application"] as const

export type OutreachListFilters = {
  types?: readonly string[]
  type?: string
  status?: string
  statusSuggestion?: string
}

export function outreachListQuery(filters: OutreachListFilters): string {
  const params = new URLSearchParams()
  if (filters.types?.length) params.set("types", filters.types.join(","))
  else if (filters.type) params.set("type", filters.type)
  if (filters.status) params.set("status", filters.status)
  if (filters.statusSuggestion) params.set("statusSuggestion", filters.statusSuggestion)
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export function outreachPagePath(filters: OutreachListFilters): string {
  return `/outreach${outreachListQuery(filters)}`
}

export function outreachFilterLabel(filters: OutreachListFilters): string {
  if (filters.statusSuggestion === "rejected") return "Possible rejections"
  if (filters.types?.length) {
    const status = filters.status ? ` · ${filters.status.replace(/_/g, " ")}` : ""
    return `First-time mail${status}`
  }
  if (filters.type === "follow_up") return "Follow-ups"
  if (filters.type === "email_reply") return "Your replies"
  if (filters.status === "replied") return "Company replied"
  if (filters.type) return filters.type.replace(/_/g, " ")
  if (filters.status) return filters.status.replace(/_/g, " ")
  return "All outreach"
}
