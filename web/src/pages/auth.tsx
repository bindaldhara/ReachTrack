import { useState, type FormEvent, type ReactNode } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { isConfigured } from "@/lib/config"

export function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(email, password)
      navigate("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Track every job outreach in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConfigured ? (
            <p className="text-sm text-destructive">
              Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env to enable auth.
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            No account?{" "}
            <Link to="/signup" className="text-foreground underline underline-offset-4">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

export function SignupPage() {
  const { session, signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const msg = await signUp(email, password, fullName)
      toast.success(msg)
      navigate("/login")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Your profile is created with your first sign-in.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConfigured ? (
            <p className="text-sm text-destructive">
              Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env to enable auth.
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <p className="font-heading text-xl font-semibold">ReachTrack</p>
        <div className="max-w-md space-y-3">
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            One place for every job outreach.
          </h1>
          <p className="text-primary-foreground/80">
            Whether it began in Gmail, LinkedIn, or a careers page — without maintaining a
            spreadsheet.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Days 1–2 foundation · Auth + core CRM</p>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  )
}
