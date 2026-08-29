import type { Channel, OutreachType, ReminderKind, Source, Status } from "@/lib/labels"

export type GmailConnectionStatus = {
  connected: boolean
  email?: string
  connectedAt?: string
  scopes?: string
}

export type GmailSyncResult = {
  date: string
  fetched: number
  imported: number
  updated: number
  byType?: Record<string, number>
  rejectionsScanned?: number
  rejectionsSuggested?: number
}

export type Profile = {
  id: string
  email: string
  fullName: string
  timezone: string
  createdAt: string
  updatedAt: string
}

export type Company = {
  id: string
  userId: string
  name: string
  domain: string | null
  website: string | null
  linkedinUrl: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type Contact = {
  id: string
  userId: string
  companyId: string | null
  firstName: string
  lastName: string
  email: string | null
  linkedinUrl: string | null
  title: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type Job = {
  id: string
  userId: string
  companyId: string | null
  title: string
  url: string | null
  location: string
  status: Status
  notes: string
  createdAt: string
  updatedAt: string
}

export type Conversation = {
  id: string
  userId: string
  contactId: string | null
  companyId: string | null
  jobId: string | null
  channel: Channel
  subject: string
  status: Status
  lastEventAt: string | null
  createdAt: string
  updatedAt: string
}

export type OutreachEvent = {
  id: string
  userId: string
  conversationId: string | null
  contactId: string | null
  companyId: string | null
  jobId: string | null
  type: OutreachType
  channel: Channel
  source: Source
  status: Status
  subject: string
  body: string
  externalId: string | null
  gmailThreadId: string | null
  statusSuggestion: "rejected" | null
  statusSuggestionReason: string
  statusSuggestionSnippet: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type Reminder = {
  id: string
  userId: string
  outreachEventId: string | null
  conversationId: string | null
  kind: ReminderKind
  dueAt: string
  notes: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type OutreachDashboard = {
  firstMailSent: number
  followUpsTaken: number
  replies: number
  rejections: number
  possibleRejections: number
  waiting: number
  followUpDue: number
}

export type GmailScanRejectionsResult = {
  scanned: number
  suggested: number
}

export type Stats = {
  outreachDashboard: OutreachDashboard
  outreachByStatus: Record<string, number>
  conversationsByStatus: Record<string, number>
  jobsByStatus: Record<string, number>
  openReminders: number
  totalOutreach: number
  totalContacts: number
  totalCompanies: number
}

export function contactName(c: Pick<Contact, "firstName" | "lastName">) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Untitled contact"
}

export function toLocalInput(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string) {
  if (!value) return new Date().toISOString()
  return new Date(value).toISOString()
}

export function formatDate(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
