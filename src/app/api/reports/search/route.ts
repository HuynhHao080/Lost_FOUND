import { NextRequest, NextResponse } from "next/server";
import { searchPublicReports } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { validateDynamoConfig, REPORTS_TABLE } from "@/lib/aws/dynamodb";
import { validateSearchQuery } from "@/lib/validations/search";

/**
 * GET /api/reports/search
 *
 * Public (unauthenticated) endpoint for browsing reports.
 * Supports optional filters: type, category, status, location, search, limit.
 *
 * Returns only public-safe fields — no userId or DynamoDB key attributes.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const query = validateSearchQuery(url.searchParams);
  if (!query) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  try {
    validateDynamoConfig();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { reports, lastKey } = await searchPublicReports(
      {
        type: query.type,
        category: query.category,
        status: query.status,
        location: query.location,
        search: query.search,
      },
      query.limit,
    );

    // Defensive: strip any internal attributes before responding.
    const publicReports = reports.map(toPublicReport);

    return NextResponse.json({
      reports: publicReports,
      pagination: lastKey ? { nextCursor: encodeURIComponent(JSON.stringify(lastKey)) } : undefined,
    });
  } catch (err) {
    console.error("[GET /api/reports/search] DynamoDB error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
      table: REPORTS_TABLE,
    });
    return NextResponse.json({ error: "Failed to search reports" }, { status: 500 });
  }
}
