/**
 * Authenticate through Cognito Hosted UI and return session cookies.
 * Uses the provided test credentials.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COGNITO_DOMAIN = "us-east-1b0tueuhay.auth.us-east-1.amazoncognito.com";
const CLIENT_ID = "1hfu4qtllak1jvdvkg29cpomdp";
const EMAIL = "huynhhao080@gmail.com";
const PASSWORD = "aa12345AA@#";

const REDIRECT_URI = `${BASE}/api/auth/callback`;
const loginPageUrl = `https://${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid+email`;

function getCookie(res, name) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const c of cookies) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (pair.slice(0, idx).trim() === name) return pair.slice(idx + 1);
  }
  return null;
}

async function main() {
  console.log("Starting Cognito authentication...");
  console.log(`Base URL: ${BASE}`);
  console.log(`Cognito Domain: ${COGNITO_DOMAIN}`);
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);

  // 1. Load the login page to obtain CSRF token + session cookies
  console.log("\n1. Loading Cognito login page...");
  const pageRes = await fetch(loginPageUrl);
  const html = await pageRes.text();
  
  const csrfMatch = html.match(/name="csrf" value="([^"]+)"/);
  if (!csrfMatch) {
    throw new Error("Could not find CSRF token on login page");
  }
  console.log("✓ CSRF token found");

  const cookies = {};
  for (const name of ["XSRF-TOKEN", "awsccc-a"]) {
    const v = getCookie(pageRes, name);
    if (v) cookies[name] = v;
  }
  console.log(`✓ Initial cookies: ${Object.keys(cookies).join(", ") || "none"}`);

  // 2. Submit credentials
  console.log("\n2. Submitting credentials...");
  const emailField = html.match(/name="([^"]*)"[^>]*autocomplete="username"/)?.[1] ?? "username";
  const passwordField = html.match(/name="([^"]*)"[^>]*type="password"/)?.[1] ?? "password";

  const form = new URLSearchParams({
    csrf: csrfMatch[1],
    [emailField]: EMAIL,
    [passwordField]: PASSWORD,
    signInSubmitButton: "Sign in",
  });

  const postHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "),
  };

  const submitRes = await fetch(
    `https://${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid+email`,
    { method: "POST", headers: postHeaders, body: form.toString(), redirect: "manual" },
  );

  for (const name of ["XSRF-TOKEN", "awsccc-a"]) {
    const v = getCookie(submitRes, name);
    if (v) cookies[name] = v;
  }

  let location = submitRes.headers.get("location");
  if (!location) {
    const body = await submitRes.text();
    const err = body.match(/errorBox[^>]*>([^<]+)/)?.[1];
    throw new Error(`Login failed (HTTP ${submitRes.status})${err ? `: ${err}` : ""}`);
  }
  console.log("✓ Credentials submitted, following redirects...");

  // 3. Follow redirects until we land back at our app and collect session cookies
  let appCookies = {};
  for (let hop = 0; hop < 10; hop++) {
    const nextUrl = new URL(location, `https://${COGNITO_DOMAIN}`);
    const res = await fetch(nextUrl, {
      redirect: "manual",
      headers: { Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      appCookies[pair.slice(0, i).trim()] = pair.slice(i + 1);
    }
    if (!res.headers.get("location")) break;
    location = res.headers.get("location");
  }

  const cookieHeader = Object.entries(appCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  
  if (!cookieHeader.includes("id_token") && !cookieHeader.includes("access_token")) {
    throw new Error("Did not receive app session cookies after login");
  }
  console.log("✓ Authenticated session established");
  console.log(`Session cookies: ${Object.keys(appCookies).join(", ")}`);

  // Save cookies to file for reuse
  const fs = await import("fs");
  fs.writeFileSync("session-cookies.json", JSON.stringify(appCookies, null, 2));
  console.log("✓ Session cookies saved to session-cookies.json");

  return appCookies;
}

main().catch((err) => {
  console.error("Authentication failed:", err.message);
  process.exit(1);
});