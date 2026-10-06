import "server-only";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";

export const COGNITO_CONFIG = {
  region: process.env.COGNITO_REGION || "us-east-1",
  userPoolId: process.env.COGNITO_USER_POOL_ID || "us-east-1_b0tuEUHaY",
  clientId: process.env.COGNITO_CLIENT_ID || "1hfu4qtllak1jvdvkg29cpomdp",
  clientSecret: process.env.COGNITO_CLIENT_SECRET || "",
  domain: process.env.COGNITO_DOMAIN || "",
  redirectUri: process.env.COGNITO_REDIRECT_URI || "http://localhost:3000/api/auth/callback",
  logoutUri: process.env.COGNITO_LOGOUT_URI || "http://localhost:3000",
} as const;

export type CognitoConfig = typeof COGNITO_CONFIG;

export type User = {
  email: string;
  sub: string;
  [key: string]: unknown;
};

/**
 * Generates the OAuth authorization URL for Cognito Hosted UI
 */
export function getAuthorizationUrl(): string {
  const { domain, clientId, redirectUri } = COGNITO_CONFIG;

  if (!domain) {
    throw new Error("COGNITO_DOMAIN environment variable is not set");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid email",
  });

  // domain is the complete Cognito Hosted UI domain (e.g., us-east-1b0tueuhay.auth.us-east-1.amazoncognito.com)
  return `https://${domain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Generates the logout URL for Cognito
 */
export function getLogoutUrl(): string {
  const { domain, clientId, logoutUri } = COGNITO_CONFIG;

  if (!domain) {
    throw new Error("COGNITO_DOMAIN environment variable is not set");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  });

  // domain is the complete Cognito Hosted UI domain (e.g., us-east-1b0tueuhay.auth.us-east-1.amazoncognito.com)
  return `https://${domain}/oauth2/logout?${params.toString()}`;
}

/**
 * Gets the current authenticated user from the session
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const idToken = cookieStore.get("id_token")?.value;

  if (!idToken) {
    return null;
  }

  try {
    const decoded = await decodeJwt(idToken);
    return {
      email: decoded.email as string,
      sub: decoded.sub as string,
      ...decoded,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  if (!accessToken) {
    return false;
  }

  try {
    const decoded = await decodeJwt(accessToken);
    const exp = decoded.exp as number;
    return Date.now() < exp * 1000;
  } catch {
    return false;
  }
}
