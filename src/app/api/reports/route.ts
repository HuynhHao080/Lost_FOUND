import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";
import { validateReport, ReportInput } from "@/lib/validations/report";
import { createReport, getReportsByUser, type Report } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { validateDynamoConfig } from "@/lib/aws/dynamodb";

interface User {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Gets the current authenticated user from the session.
 */
async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const idToken = cookieStore.get("id_token")?.value;

  if (!idToken) {
    return null;
  }

  try {
    const decoded = await decodeJwt(idToken);
    return {
      sub: decoded.sub as string,
      email: decoded.email as string,
      ...decoded,
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/reports
 *
 * Creates a new lost or found item report.
 *
 * Requires authentication via Cognito.
 * Validates input using Zod schema.
 * Stores report in DynamoDB with server-generated ID and timestamps.
 */
export async function POST(request: NextRequest) {
  // Check authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  // Validate DynamoDB configuration
  try {
    validateDynamoConfig();
  } catch {
    return NextResponse.json({ error: "Lỗi cấu hình máy chủ" }, { status: 500 });
  }

  // Parse and validate request body
  let input: ReportInput;
  try {
    const body = await request.json();
    input = validateReport(body);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Dữ liệu không hợp lệ";
    return NextResponse.json({ error }, { status: 400 });
  }

  // Create the report
  try {
    const report = await createReport(user.sub, input);
    // Public-safe shape only — no userId or DynamoDB keys
    return NextResponse.json(toPublicReport(report), { status: 201 });
  } catch (err) {
    // Temporary server-side diagnostics (never sent to the client)
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error("[POST /api/reports] DynamoDB error:", {
      name: e?.name,
      message: e?.message,
      code: (e as { Code?: string })?.Code ?? undefined,
      httpStatus: e?.$metadata?.httpStatusCode,
    });
    // Don't leak internal error details
    return NextResponse.json({ error: "Không thể tạo tin báo" }, { status: 500 });
  }
}

/**
 * GET /api/reports
 *
 * Gets all reports belonging to the authenticated user.
 *
 * Query parameters:
 * - limit: number (optional, default: 50)
 * - lastKey: string (optional, for pagination)
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  // Validate DynamoDB configuration
  try {
    validateDynamoConfig();
  } catch {
    return NextResponse.json({ error: "Lỗi cấu hình máy chủ" }, { status: 500 });
  }

  // Parse query parameters — reject non-numeric limits rather than passing NaN
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  if (Number.isNaN(rawLimit) || rawLimit < 1) {
    return NextResponse.json({ error: "Tham số giới hạn không hợp lệ" }, { status: 400 });
  }
  const limit = Math.min(rawLimit, 100);

  try {
    const { reports, lastKey } = await getReportsByUser(user.sub, limit);
    return NextResponse.json({
      // Public-safe shape (no userId / DynamoDB keys / raw imageKey);
      // updatedAt is added because owners see lifecycle timestamps.
      reports: reports.map((r: Report) => ({ ...toPublicReport(r), updatedAt: r.updatedAt })),
      pagination: lastKey ? { lastKey } : undefined,
    });
  } catch {
    // Don't leak internal error details
    return NextResponse.json({ error: "Không tải được tin báo" }, { status: 500 });
  }
}
