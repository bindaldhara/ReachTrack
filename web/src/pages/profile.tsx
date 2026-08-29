import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/fields"
import { PageHeader } from "@/components/page-header"
import { GmailIntegrationCard } from "@/components/gmail-integration"
import { useAuth } from "@/hooks/use-auth"

export function ProfilePage() {
  const { profile, user, request, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.fullName ?? "")
  const [timezone, setTimezone] = useState(profile?.timezone ?? "UTC")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.fullName)
    setTimezone(profile.timezone)
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await request("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ fullName, timezone }),
      })
      await refreshProfile()
      toast.success("Profile saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Profile" description="Your account details for this workspace." />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
            </Field>
            <Button type="submit" disabled={busy}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-6">
        <GmailIntegrationCard />
      </div>
    </div>
  )
}
