import { ReportsBrowser } from "@/components/reports/reports-browser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tìm Đồ Thất Lạc — Xem tin báo",
  description: "Xem và tìm kiếm tin báo đồ bị mất và đồ nhặt được",
};

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Tìm Đồ Thất Lạc</h1>
            <p className="mt-1 text-muted-foreground">
              Xem tin báo đồ bị mất và đồ nhặt được. Không cần tài khoản để xem.
            </p>
          </header>

          <ReportsBrowser />
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Tìm Đồ Thất Lạc. Mọi quyền được bảo lưu.
        </div>
      </footer>
    </div>
  );
}
