/**
 * End-to-end matching test using a real Cognito session.
 *
 * Logs in through Cognito Managed Login (headless), captures the app's
 * HTTP-only session cookies, then:
 *   1. POSTs the FOUND test report
 *   2. GETs matches for the existing LOST report "Mất ví"
 *   3. Prints the ranked match result
 *
 * Credentials are read from TEST_EMAIL / TEST_PASSWORD env vars and are
 * never printed or stored.
 *
 * Run: node scripts/test-matching.mjs
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COGNITO_DOMAIN = "us-east-1b0tueuhay.auth.us-east-1.amazoncognito.com";
const CLIENT_ID = "1hfu4qtllak1jvdvkg29cpomdp";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set TEST_EMAIL and TEST_PASSWORD environment variables to run this test.");
  process.exit(1);
}

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
  // 1. Load the login page to obtain CSRF token + session cookies
  const pageRes = await fetch(loginPageUrl);
  const html = await pageRes.text();
  const csrfMatch = html.match(/name="csrf" value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not find CSRF token on login page");

  const cookies = {};
  for (const name of ["XSRF-TOKEN", "awsccc-a"]) {
    const v = getCookie(pageRes, name);
    if (v) cookies[name] = v;
  }

  // 2. Submit credentials (field names discovered from the form HTML)
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
    Cookie: Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
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
  console.log("✓ Authenticated session established\n");

  const authFetch = (path, opts = {}) =>
    fetch(`${BASE}${path}`, {
      ...opts,
      headers: { ...(opts.headers ?? {}), Cookie: cookieHeader },
    });

  // 4. Create the FOUND test report via the real API
  const createRes = await authFetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "FOUND",
      title: "Tìm thấy ví màu đen",
      description: "Tìm thấy một chiếc ví màu đen ở thư viện",
      category: "Wallet",
      location: "Thư viện",
      dateOccurred: "2026-08-26",
    }),
  });
  const created = await createRes.json();
  console.log(`POST /api/reports → ${createRes.status}`);
  if (createRes.status === 201) {
    console.log(`  created FOUND report id: ${created.id}\n`);
  } else {
    console.log(`  response: ${JSON.stringify(created)}\n`);
  }

  // 5. Get matches for the LOST report
  const LOST_ID = "37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c";
  const matchesRes = await authFetch(`/api/reports/${LOST_ID}/matches`);
  console.log(`GET /api/reports/${LOST_ID}/matches → ${matchesRes.status}`);

  if (matchesRes.status === 403) {
    console.log("  The LOST report belongs to a different user than the test account.");
    return;
  }
  if (!matchesRes.ok) {
    console.log(`  response: ${JSON.stringify(await matchesRes.json())}`);
    return;
  }

  const data = await matchesRes.json();
  console.log(`\nSource report: "${data.report.title}" (${data.report.type})`);
  console.log(`Matches found: ${data.matches.length}\n`);

  for (const m of data.matches) {
    console.log(`[${m.label}] ${m.score}% — "${m.report.title}" (${m.report.type})`);
    console.log(
      `  category: ${m.report.category} | location: ${m.report.location} | date: ${m.report.dateOccurred ?? "-"}`,
    );
    for (const r of m.reasons) console.log(`  ✓ ${r}`);
    console.log("");
  }

  // Verify no private fields leaked
  const raw = JSON.stringify(data);
  const leaks = ["userId", "PK", "SK", "GSI1PK", "GSI1SK"].filter((k) => raw.includes(`"${k}"`));
  console.log(leaks.length === 0 ? "✓ No private fields in response" : `✗ LEAKED: ${leaks.join(", ")}`);
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
