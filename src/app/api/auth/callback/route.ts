import { NextResponse } from "next/server";
import { COGNITO_CONFIG } from "@/lib/auth/cognito";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Check for OAuth error parameters first
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      {
        error: error,
        error_description: errorDescription || "Đăng nhập thất bại",
      },
      { status: 400 },
    );
  }

  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Không tìm thấy mã ủy quyền" }, { status: 400 });
  }

  // Validate client secret is configured
  if (!COGNITO_CONFIG.clientSecret) {
    return NextResponse.json(
      { error: "Lỗi cấu hình máy chủ: chưa đặt COGNITO_CLIENT_SECRET" },
      { status: 500 },
    );
  }

  try {
    // Exchange authorization code for tokens using Cognito's token endpoint
    // domain is the complete Cognito Hosted UI domain
    const tokenUrl = `https://${COGNITO_CONFIG.domain}/oauth2/token`;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: COGNITO_CONFIG.clientId,
      client_secret: COGNITO_CONFIG.clientSecret,
      code,
      redirect_uri: COGNITO_CONFIG.redirectUri,
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!tokenResponse.ok) {
      // Sanitize error response to avoid leaking sensitive info
      return NextResponse.json({ error: "Không đổi được mã truy cập, vui lòng đăng nhập lại" }, { status: 401 });
    }

    const tokens = await tokenResponse.json();

    // Create response with secure cookies
    const response = NextResponse.redirect(new URL("/dashboard", request.url));

    // Set tokens in secure HTTP-only cookies
    const maxAge = tokens.expires_in || 3600;

    if (tokens.access_token) {
      response.cookies.set("access_token", tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge,
      });
    }

    if (tokens.id_token) {
      response.cookies.set("id_token", tokens.id_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge,
      });
    }

    if (tokens.refresh_token) {
      response.cookies.set("refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đăng nhập thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
