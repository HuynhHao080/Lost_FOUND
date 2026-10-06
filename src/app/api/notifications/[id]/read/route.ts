import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import { markNotificationRead } from "@/lib/repositories/notification-repository";

/**
 * POST /api/notifications/[id]/read
 *
 * Marks one of the authenticated user's notifications as read.
 * Ownership is enforced by the key design — another user's notification id
 * simply does not exist under this user's partition.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  }

  try {
    const updated = await markNotificationRead(user.sub, id);
    if (!updated) {
      return NextResponse.json(
        { error: "Notification not found or already read" },
        { status: 404 },
      );
    }
    return NextResponse.json({ message: "Marked as read" });
  } catch (err) {
    console.error("[POST /api/notifications/:id/read] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}
