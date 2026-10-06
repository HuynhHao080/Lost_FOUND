import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportCard } from "@/components/reports/report-card";
import { searchPublicReports } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import {
  Laptop,
  Wallet,
  Key,
  Backpack,
  FileText,
  Shirt,
  HelpCircle,
  Search,
  PlusCircle,
  Users,
  ShieldCheck,
  MapPin,
  Inbox,
  AlertTriangle,
} from "lucide-react";

const categories = [
  { id: "electronics", name: "Electronics", icon: Laptop },
  { id: "wallet", name: "Wallets", icon: Wallet },
  { id: "keys", name: "Keys", icon: Key },
  { id: "bags", name: "Bags", icon: Backpack },
  { id: "documents", name: "Documents", icon: FileText },
  { id: "clothing", name: "Clothing", icon: Shirt },
  { id: "other", name: "Other", icon: HelpCircle },
];

export const dynamic = "force-dynamic";

async function getRecentReports() {
  try {
    const { reports } = await searchPublicReports({}, 6);
    return { reports: reports.map(toPublicReport), error: false };
  } catch {
    return { reports: [], error: true };
  }
}

export default async function HomePage() {
  const { reports, error } = await getRecentReports();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-primary p-2">
              <Search className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Lost & Found</span>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/reports"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Browse Lost & Found
            </Link>
            <a href="#browse" className="text-sm font-medium hover:text-primary transition-colors">
              Categories
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              How It Works
            </a>
          </nav>
          <div className="flex items-center space-x-4">
            <a
              href="/api/auth/login"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Sign In
            </a>
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-medium"
            >
              Report Item
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-muted/20 py-20 lg:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
            Never lose what matters
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Report lost items and discover potential matches with AI-assisted matching. Connect with
            owners and recover your belongings faster.
          </p>

          {/* Links to the live public search */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              href="/reports"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 w-full max-w-md mx-auto"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search reports
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-lg px-6 h-10 text-sm font-medium"
            >
              <PlusCircle className="h-5 w-5" aria-hidden="true" />
              Report Lost Item
            </Link>
            <Link
              href="/reports"
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-6 h-10 text-sm font-medium hover:bg-muted"
            >
              Browse Found Items
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Categories */}
      <section className="py-16 bg-background" id="browse">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/reports?category=${encodeURIComponent(category.name)}`}
                className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="flex flex-col items-center justify-center p-6">
                    <category.icon className="h-8 w-8 mb-2 text-primary" />
                    <span className="text-sm font-medium">{category.name}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Reports — real data from DynamoDB via the public-safe mapper */}
      <section className="py-16 bg-muted/20" id="recent">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-foreground">Recent Reports</h2>
            <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="max-w-md text-sm text-destructive">
                Could not load recent reports right now.
              </p>
              <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Browse all reports instead
              </Link>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No reports yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Be the first to report a lost or found item.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ReportCard report={report} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-background" id="how-it-works">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <PlusCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Report an Item</h3>
              <p className="text-muted-foreground">
                Create a detailed report with photos and location information.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Finds Matches</h3>
              <p className="text-muted-foreground">
                Our system analyzes reports and finds potential matches using AI assistance.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Connect & Recover</h3>
              <p className="text-muted-foreground">
                Contact the owner or claim your found item directly through the platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Why Choose Lost & Found
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ShieldCheck className="h-5 w-5 mr-2 text-primary" />
                  AI-Assisted Matching
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Our intelligent matching system compares item descriptions, categories, and
                  locations to find the best potential matches.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ShieldCheck className="h-5 w-5 mr-2 text-primary" />
                  Secure Storage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Your images and reports are stored securely with enterprise-grade protection and
                  privacy controls.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-primary" />
                  Location-Aware Matching
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Proximity-based matching helps you find items near you or items you have lost in
                  specific locations.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">© {new Date().getFullYear()} Lost & Found. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
