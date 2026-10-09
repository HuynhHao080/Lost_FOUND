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
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  try {
    const updated = await markAllNotificationsRead(user.sub);
    return NextResponse.json({ message: "Đã đánh dấu tất cả thông báo là đã đọc", updated });
  } catch (err) {
    console.error("[POST /api/notifications/read-all] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không thể cập nhật thông báo" }, { status: 500 });
  }
}
