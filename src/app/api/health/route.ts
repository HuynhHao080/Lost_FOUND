/**
 * Health check endpoint for deployment verification.
 * Returns 200 with basic service status — no auth required.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "lost-found",
    timestamp: new Date().toISOString(),
  });
}
