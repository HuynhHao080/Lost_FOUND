import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import { markAllNotificationsRead } from "@/lib/repositories/notification-repository";

/**
 * POST /api/notifications/read-all
 *
 * Marks all of the authenticated user's unread notifications as read.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updated = await markAllNotificationsRead(user.sub);
    return NextResponse.json({ message: "All notifications marked as read", updated });
  } catch (err) {
    console.error("[POST /api/notifications/read-all] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
