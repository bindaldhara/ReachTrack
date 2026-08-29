import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { api } from "@/lib/api"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/lib/types"

type AuthContextValue = {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<string>
  signOut: () => Promise<void>
  request: <T>(path: string, init?: RequestInit) => Promise<T>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const refreshProfile = useCallback(async () => {
    const token = session?.access_token
    if (!token) {
      setProfile(null)
      return
    }
    const p = await api<Profile>("/api/v1/me", token)
    setProfile(p)
  }, [session?.access_token])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    refreshProfile().catch(() => setProfile(null))
  }, [session, refreshProfile])

  const request = useCallback(
    <T,>(path: string, init?: RequestInit) => {
      if (!session?.access_token) {
        return Promise.reject(new Error("Not signed in"))
      }
      return api<T>(path, session.access_token, init)
    },
    [session?.access_token],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
      signIn: async (email, password) => {
        if (!supabase) throw new Error("Supabase is not configured")
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signUp: async (email, password, fullName) => {
        if (!supabase) throw new Error("Supabase is not configured")
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        if (!data.session) {
          return "Check your email to confirm your account, then sign in."
        }
        return "Account created."
      },
      signOut: async () => {
        if (!supabase) return
        await supabase.auth.signOut()
      },
      request,
    }),
    [loading, session, profile, refreshProfile, request],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
