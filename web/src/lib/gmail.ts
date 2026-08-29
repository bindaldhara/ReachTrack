import type { OutreachEvent } from "@/lib/types"

export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`
}

export function outreachEmailUrl(
  event: Pick<OutreachEvent, "source" | "externalId">,
): string | null {
  if (event.source !== "gmail" || !event.externalId?.trim()) return null
  return gmailMessageUrl(event.externalId)
}
