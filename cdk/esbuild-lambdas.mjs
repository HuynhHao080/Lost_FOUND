import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, "lambda-dist");

async function main() {
  // Clean output directory
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  // Build notification worker (Lambda-compatible version without server-only imports)
  await build({
    entryPoints: [join(__dirname, "..", "src", "lib", "notifications", "worker-lambda.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: join(OUT_DIR, "notification-worker.js"),
    external: ["@aws-sdk/*"],
    format: "cjs",
    sourcemap: true,
    alias: {
      "@": join(__dirname, "..", "src"),
    },
    inject: [join(__dirname, "lambda-shim.js")],
  });

  // Build rekognition worker
  await build({
    entryPoints: [join(__dirname, "..", "src", "lib", "aws", "lambda", "rekognition-worker.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    outfile: join(OUT_DIR, "rekognition-worker.js"),
    external: ["@aws-sdk/*"],
    format: "cjs",
    sourcemap: true,
  });

  console.log("Lambda bundles created in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});