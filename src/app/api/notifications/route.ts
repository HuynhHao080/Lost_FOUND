import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getUserNotifications, toSafeNotification } from "@/lib/repositories/notification-repository";

/**
 * GET /api/notifications
 *
 * Returns the authenticated user's notifications, newest first.
 * Ownership is derived from the session — no client-supplied userId.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Limit is clamped server-side
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1), 50);

  try {
    const { notifications, lastKey } = await getUserNotifications(user.sub, limit);

    return NextResponse.json({
      notifications: notifications.map(toSafeNotification),
      unreadCount: notifications.filter((n) => !n.readAt).length,
      pagination: lastKey ? { hasMore: true } : undefined,
    });
  } catch (err) {
    console.error("[GET /api/notifications] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
