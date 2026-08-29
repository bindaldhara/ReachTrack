export const STATUSES = [
  "sent",
  "waiting",
  "replied",
  "follow_up_due",
  "interview",
  "rejected",
  "closed",
] as const

export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  sent: "Sent",
  waiting: "Waiting",
  replied: "Replied",
  follow_up_due: "Follow-up Due",
  interview: "Interview",
  rejected: "Rejected",
  closed: "Closed",
}

export const TYPES = [
  "cold_email",
  "referral_request",
  "linkedin_dm",
  "linkedin_reply",
  "application",
] as const

export type OutreachType = (typeof TYPES)[number]

export const TYPE_LABEL: Record<OutreachType, string> = {
  cold_email: "Cold email",
  referral_request: "Referral request",
  linkedin_dm: "LinkedIn DM",
  linkedin_reply: "LinkedIn reply",
  application: "Application",
}

export const CHANNELS = ["gmail", "linkedin", "careers_page", "other"] as const
export type Channel = (typeof CHANNELS)[number]
export const CHANNEL_LABEL: Record<Channel, string> = {
  gmail: "Gmail",
  linkedin: "LinkedIn",
  careers_page: "Careers page",
  other: "Other",
}

export const SOURCES = ["manual", "gmail", "chrome_extension", "mobile_share"] as const
export type Source = (typeof SOURCES)[number]
export const SOURCE_LABEL: Record<Source, string> = {
  manual: "Manual",
  gmail: "Gmail",
  chrome_extension: "Chrome extension",
  mobile_share: "Mobile share",
}

export const REMINDER_KINDS = ["follow_up", "reply_needed", "interview"] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]
export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  follow_up: "Follow-up",
  reply_needed: "Reply needed",
  interview: "Interview",
}

export function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v)
}
