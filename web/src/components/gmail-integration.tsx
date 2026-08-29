import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Mail, RefreshCw, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GmailConnectionStatus, GmailSyncResult } from "@/lib/types"
import { TYPE_LABEL, type OutreachType } from "@/lib/labels"
import { formatDate } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

export function GmailIntegrationCard() {
  const { request } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request<GmailConnectionStatus>("/api/v1/integrations/gmail")
      setStatus(data)
    } catch (err) {
      setStatus(null)
      toast.error(err instanceof Error ? err.message : "Failed to load Gmail status")
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const result = searchParams.get("gmail")
    if (!result) return
    if (result === "connected") {
      toast.success("Gmail connected")
      refresh()
    } else if (result === "denied") {
      toast.error("Gmail connection was cancelled")
    } else {
      toast.error("Gmail connection failed")
    }
    searchParams.delete("gmail")
    setSearchParams(searchParams, { replace: true })
  }, [refresh, searchParams, setSearchParams])

  async function connect() {
    setBusy(true)
    try {
      const { authorizationUrl } = await request<{ authorizationUrl: string }>(
        "/api/v1/integrations/gmail/authorize",
      )
      window.location.href = authorizationUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Gmail sign-in")
      setBusy(false)
    }
  }

  async function importYesterday() {
    setBusy(true)
    try {
      const result = await request<GmailSyncResult>("/api/v1/integrations/gmail/sync-sent", {
        method: "POST",
        body: JSON.stringify({ date: "yesterday" }),
      })
      const breakdown = result.byType
        ? Object.entries(result.byType)
            .map(([type, n]) => `${n} ${TYPE_LABEL[type as OutreachType] ?? type}`)
            .join(", ")
        : ""
      toast.success(
        breakdown
          ? `Imported ${result.imported}, updated ${result.updated} from ${result.date}: ${breakdown}`
          : `Imported ${result.imported} email${result.imported === 1 ? "" : "s"} from ${result.date}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await request("/api/v1/integrations/gmail", { method: "DELETE" })
      setStatus({ connected: false })
      toast.success("Gmail disconnected")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" />
          Gmail
        </CardTitle>
        <CardDescription>
          Connect Gmail so ReachTrack can import sent outreach into your timeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking connection…</p>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">{status.email}</p>
              <p className="text-muted-foreground">Connected {formatDate(status.connectedAt ?? null)}</p>
            </div>
            <Button type="button" disabled={busy} onClick={importYesterday}>
              <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
              {busy ? "Importing sent mail…" : "Import yesterday's sent mail"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={disconnect}>
              <Unplug className="size-4" />
              Disconnect Gmail
            </Button>
          </div>
        ) : (
          <Button type="button" disabled={busy} onClick={connect}>
            <Mail className="size-4" />
            Connect Gmail
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
