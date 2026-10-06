import { ReportsBrowser } from "@/components/reports/reports-browser";

export const metadata = {
  title: "Lost & Found — Browse Reports",
  description: "Browse and search lost and found item reports",
};

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Lost &amp; Found</h1>
            <p className="mt-1 text-muted-foreground">
              Browse lost and found reports. No account needed to look around.
            </p>
          </header>

          <ReportsBrowser />
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
