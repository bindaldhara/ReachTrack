import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"

export function ProtectedRoute() {
  const { loading, session } = useAuth()
  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
