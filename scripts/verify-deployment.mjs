/**
 * Deployment verification script for Milestone 3.
 *
 * Checks that the core endpoints respond correctly after deployment.
 * Run after `npm run build` and server start.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function check(name, url, expectStatus) {
  try {
    const res = await fetch(url, { method: "GET" });
    const ok = res.status === expectStatus;
    console.log(`${ok ? "✓" : "✗"} ${name}: ${res.status} (expected ${expectStatus})`);
    return ok;
  } catch (err) {
    console.log(`✗ ${name}: network error (${err.message})`);
    return false;
  }
}

async function main() {
  const results = await Promise.all([
    check("Landing", `${BASE}/`, 200),
    check("Public reports", `${BASE}/reports`, 200),
    check("Public search", `${BASE}/api/reports/search`, 200),
    check("Public detail", `${BASE}/api/reports/37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c`, 200),
    check("Dashboard unauth", `${BASE}/dashboard`, 307),
    check("Health", `${BASE}/api/health`, 200),
    check("Notifications unauth", `${BASE}/api/notifications`, 401),
  ]);

  const allOk = results.every(Boolean);
  console.log(`\n${allOk ? "All checks passed" : "Some checks failed"}`);
  process.exit(allOk ? 0 : 1);
}

main();
