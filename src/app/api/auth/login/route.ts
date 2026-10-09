import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/auth/cognito";

export async function GET() {
  try {
    const authUrl = getAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi cấu hình đăng nhập";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
