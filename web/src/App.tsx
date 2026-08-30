import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { ProtectedRoute } from "@/components/protected-route"
import { AuthProvider } from "@/hooks/use-auth"
import { LoginPage, SignupPage } from "@/pages/auth"
import { CompaniesPage } from "@/pages/companies"
import { ContactsPage } from "@/pages/contacts"
import { JobsPage } from "@/pages/jobs"
import { OutreachPage } from "@/pages/outreach"
import { OverviewPage } from "@/pages/overview"
import { ProfilePage } from "@/pages/profile"
import { SuccessfullyAppliedPage } from "@/pages/successfully-applied"
import { RemindersPage } from "@/pages/reminders"
import { TodoCompaniesPage } from "@/pages/todo-companies"
import { TodoEmailsPage } from "@/pages/todo-emails"

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/outreach" element={<OutreachPage />} />
              <Route path="/successfully-applied" element={<SuccessfullyAppliedPage />} />
              <Route path="/careers-page" element={<Navigate to="/successfully-applied" replace />} />
              <Route path="/referrals" element={<Navigate to="/outreach" replace />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/todo/emails" element={<TodoEmailsPage />} />
              <Route path="/todo/companies" element={<TodoCompaniesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
