import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  UserRound,
  Users,
  Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/outreach", label: "Outreach", icon: Send },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/reminders", label: "Reminders", icon: CalendarClock },
  { to: "/profile", label: "Profile", icon: UserRound },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
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
            <Icon className="size-4" />
            {link.label}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AppShell() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate("/login")
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 md:flex md:flex-col">
        <div className="mb-6 px-1">
          <p className="font-heading text-lg font-semibold tracking-tight">ReachTrack</p>
          <p className="text-xs text-muted-foreground">Job outreach, one timeline</p>
        </div>
        <NavItems />
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
              <NavItems />
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
