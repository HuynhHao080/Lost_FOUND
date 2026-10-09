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
  { value: "Electronics", name: "Đồ điện tử", icon: Laptop },
  { value: "Wallet", name: "Ví", icon: Wallet },
  { value: "Keys", name: "Chìa khóa", icon: Key },
  { value: "Bag", name: "Túi xách", icon: Backpack },
  { value: "Document", name: "Giấy tờ", icon: FileText },
  { value: "Clothing", name: "Quần áo", icon: Shirt },
  { value: "Other", name: "Khác", icon: HelpCircle },
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
      <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/95">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-primary p-2">
              <Search className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-bold text-xl">Tìm Đồ Thất Lạc</span>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/reports" className="text-sm font-medium hover:text-primary transition-colors">Xem tin báo</Link>
            <a href="#browse" className="text-sm font-medium hover:text-primary transition-colors">Danh mục</a>
            <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">Cách hoạt động</a>
          </nav>
          <div className="flex items-center space-x-4">
            <a href="/api/auth/login" className="text-sm font-medium hover:text-primary transition-colors">Đăng nhập</a>
            <Link href="/dashboard" className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-medium">Báo mất đồ</Link>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-background to-muted/20 py-20 lg:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
            Đồ thất lạc? Hãy để cộng đồng giúp bạn tìm lại.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Đăng tin báo đồ bị mất hoặc đồ nhặt được để kết nối với người đang tìm kiếm.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/reports" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 w-full max-w-md mx-auto"><Search className="h-4 w-4" aria-hidden="true" /> Tìm kiếm tin báo</Link>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/dashboard" className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-lg px-6 h-10 text-sm font-medium"><PlusCircle className="h-5 w-5" aria-hidden="true" /> Báo mất đồ</Link>
            <Link href="/reports" className="inline-flex items-center justify-center gap-2 rounded-lg border px-6 h-10 text-sm font-medium hover:bg-muted">Xem tin báo</Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-background" id="browse">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Khám phá theo danh mục</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {categories.map((category) => (
              <Link key={category.value} href={`/reports?category=${encodeURIComponent(category.value)}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
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

      <section className="py-16 bg-muted/20" id="recent">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-foreground">Tin báo gần đây</h2>
            <Link href="/reports" className="text-sm font-medium text-primary hover:underline">Xem tất cả</Link>
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="max-w-md text-sm text-destructive">Không thể tải tin báo ngay bây giờ.</p>
              <Link href="/reports" className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Xem tất cả tin báo</Link>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Chưa có tin báo nào.</p>
              <p className="max-w-sm text-sm text-muted-foreground">Hãy là người đầu tiên báo tin mất hoặc nhặt được.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => (
                <Link key={report.id} href={`/reports/${report.id}`} className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
                  <ReportCard report={report} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-background" id="how-it-works">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Cách hoạt động</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><PlusCircle className="h-8 w-8 text-primary" /></div>
              <h3 className="text-xl font-semibold mb-2">Đăng tin báo</h3>
              <p className="text-muted-foreground">Tạo tin báo chi tiết với ảnh và thông tin địa điểm.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><Search className="h-8 w-8 text-primary" /></div>
              <h3 className="text-xl font-semibold mb-2">AI tìm kết quả phù hợp</h3>
              <p className="text-muted-foreground">Hệ thống phân tích và tìm các tin báo có khả năng liên quan.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><Users className="h-8 w-8 text-primary" /></div>
              <h3 className="text-xl font-semibold mb-2">Kết nối & Lấy lại</h3>
              <p className="text-muted-foreground">Liên hệ chủ nhân hoặc nhận đồ nhặt được trực tiếp.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Tại sao chọn Tìm Đồ Thất Lạc</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardHeader><CardTitle className="flex items-center"><ShieldCheck className="h-5 w-5 mr-2 text-primary" /> Ghép kết quả bằng AI</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">Hệ thống ghép thông minh so sánh mô tả, danh mục và địa điểm để tìm kết quả tốt nhất.</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center"><ShieldCheck className="h-5 w-5 mr-2 text-primary" /> Lưu trữ bảo mật</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">Hình ảnh và tin báo của bạn được lưu trữ an toàn với bảo vệ cấp doanh nghiệp.</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center"><MapPin className="h-5 w-5 mr-2 text-primary" /> Ghép theo vị trí</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">Ghép dựa trên vị trí giúp bạn tìm đồ gần bạn hoặc đồ bị mất tại địa điểm cụ thể.</p></CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="bg-foreground text-background py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">© {new Date().getFullYear()} Tìm Đồ Thất Lạc. Mọi quyền được bảo lưu.</p>
        </div>
      </footer>
    </div>
  );
}
