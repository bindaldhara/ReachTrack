export const FIRST_MAIL_TYPES = ["cold_email", "referral_request", "application"] as const

export const APPLICATION_CONFIRMATION_CHANNELS = ["careers_page", "linkedin"] as const

export const OUTBOUND_FIRST_MAIL_TYPES = ["cold_email"] as const

export type OutreachListFilters = {
  types?: readonly string[]
  type?: string
  status?: string
  statusSuggestion?: string
  channel?: string
  q?: string
}

export function filtersFromParams(params: URLSearchParams): OutreachListFilters {
  const types = params.get("types")
  return {
    types: types ? types.split(",").filter(Boolean) : undefined,
    type: params.get("type") || undefined,
    status: params.get("status") || undefined,
    statusSuggestion: params.get("statusSuggestion") || undefined,
    channel: params.get("channel") || undefined,
    q: params.get("q") || undefined,
  }
}

export function outreachListQuery(
  filters: OutreachListFilters & { limit?: string; offset?: string },
): string {
  const params = new URLSearchParams()
  if (filters.types?.length) params.set("types", filters.types.join(","))
  else if (filters.type) params.set("type", filters.type)
  if (filters.status) params.set("status", filters.status)
  if (filters.statusSuggestion) params.set("statusSuggestion", filters.statusSuggestion)
  if (filters.channel) params.set("channel", filters.channel)
  if (filters.q) params.set("q", filters.q)
  if (filters.limit) params.set("limit", filters.limit)
  if (filters.offset) params.set("offset", filters.offset)
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export function outreachPagePath(filters: OutreachListFilters): string {
  return `/outreach${outreachListQuery(filters)}`
}

export function outreachFilterLabel(filters: OutreachListFilters): string {
  if (filters.channel === "careers_page") return "Successfully applied"
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
