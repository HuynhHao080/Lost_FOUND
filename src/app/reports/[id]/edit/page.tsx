import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReportById } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { EditReportForm } from "@/components/reports/edit-report-form";

export const dynamic = "force-dynamic";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report = null;
  try {
    const internal = await getReportById(id);
    report = internal ? toPublicReport(internal) : null;
  } catch {
    report = null;
  }

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-lg font-medium">Không tìm thấy tin báo</p>
        <Link href="/reports" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Về danh sách tin báo</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link href={`/reports/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Về chi tiết tin báo
          </Link>
          <EditReportForm report={report} />
        </div>
      </main>
    </div>
  );
}
