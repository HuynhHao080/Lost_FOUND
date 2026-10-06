import { NextResponse } from "next/server";
import { getLogoutUrl } from "@/lib/auth/cognito";

export async function GET() {
  try {
    const logoutUrl = getLogoutUrl();

    // Create response and clear cookies
    const response = NextResponse.redirect(logoutUrl);

    response.cookies.delete("access_token");
    response.cookies.delete("id_token");
    response.cookies.delete("refresh_token");

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
