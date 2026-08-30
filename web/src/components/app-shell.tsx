import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  Building2,
  CalendarClock,
  CircleCheck,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Mail,
  Menu,
  Send,
  UserRound,
  Users,
  Briefcase,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/hooks/use-auth"
import { useSidebarWidth } from "@/hooks/use-sidebar-width"
import type { TodoSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/outreach", label: "Outreach", icon: Send },
  { to: "/successfully-applied", label: "Successfully applied", icon: CircleCheck },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/reminders", label: "Reminders", icon: CalendarClock },
  { to: "/profile", label: "Profile", icon: UserRound },
]

const todoLinks = [
  { to: "/todo/emails", label: "Emails to send", icon: Mail, countKey: "emailCount" as const },
  {
    to: "/todo/companies",
    label: "Companies to reach out",
    icon: Building2,
    countKey: "companyCount" as const,
  },
]

function NavCount({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Badge
      variant="secondary"
      className="h-5 min-w-5 shrink-0 justify-center rounded-full border-0 bg-sidebar-accent px-1.5 text-[11px] font-semibold tabular-nums text-sidebar-accent-foreground"
    >
      {count}
    </Badge>
  )
}

function NavItems({
  onNavigate,
  todoCounts,
}: {
  onNavigate?: () => void
  todoCounts: TodoSummary | null
}) {
  return (
    <nav className="grid gap-1">
      {links.map((link) => {
        const Icon = link.icon
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{link.label}</span>
          </NavLink>
        )
      })}
      <div className="mt-3 px-2.5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListTodo className="size-3.5" />
          Todo
        </p>
      </div>
      {todoLinks.map((link) => {
        const Icon = link.icon
        const count = todoCounts?.[link.countKey] ?? 0
        return (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg py-2 pl-7 pr-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{link.label}</span>
            <NavCount count={count} />
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AppShell() {
  const { profile, user, signOut, request } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [todoCounts, setTodoCounts] = useState<TodoSummary | null>(null)
  const { width, onResizeStart } = useSidebarWidth()

  useEffect(() => {
    let cancelled = false
    request<TodoSummary>("/api/v1/todo/summary")
      .then((summary) => {
        if (!cancelled) setTodoCounts(summary)
      })
      .catch(() => {
        if (!cancelled) setTodoCounts(null)
      })
    return () => {
      cancelled = true
    }
  }, [request, location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate("/login")
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside
        className="relative hidden shrink-0 border-r bg-sidebar p-4 md:flex md:flex-col"
        style={{ width }}
      >
        <div className="mb-6 px-1">
          <p className="font-heading text-lg font-semibold tracking-tight">ReachTrack</p>
          <p className="text-xs text-muted-foreground">Job outreach, one timeline</p>
        </div>
        <NavItems todoCounts={todoCounts} />
        <div className="mt-auto pt-4">
          <Separator className="mb-3" />
          <p className="truncate px-1 text-xs text-muted-foreground">
            {profile?.fullName || user?.email}
          </p>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={onResizeStart}
          className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-border"
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <p className="mb-4 font-heading text-lg font-semibold">ReachTrack</p>
              <NavItems todoCounts={todoCounts} />
            </SheetContent>
          </Sheet>
          <span className="font-heading font-medium">ReachTrack</span>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
