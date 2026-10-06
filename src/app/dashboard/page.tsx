import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, isAuthenticated } from "@/lib/auth/cognito";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Search, LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const isAuth = await isAuthenticated();

  if (!isAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground">
              You need to sign in to access your dashboard.
            </p>
            <form action="/api/auth/login" className="w-full">
              <Button type="submit" className="w-full">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = await getCurrentUser();
  const firstName = user?.email ? user.email.split("@")[0] : "there";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-2">
              <Search className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-bold text-xl">Lost &amp; Found</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse Lost &amp; Found
            </Link>
            <NotificationBell />
            {user?.email && (
              <span
                className="hidden md:inline max-w-48 truncate text-sm text-muted-foreground"
                title={user.email}
              >
                {user.email}
              </span>
            )}
            <form action="/api/auth/logout">
              <Button variant="outline" size="sm" type="submit">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Welcome section */}
          <section aria-labelledby="welcome-heading">
            <h1 id="welcome-heading" className="text-3xl font-bold tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-muted-foreground">Manage your lost and found reports below.</p>
          </section>

          {/* Stats + Create form + Reports list (shared client state) */}
          <DashboardContent />
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Lost &amp; Found. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
