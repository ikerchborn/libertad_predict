import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const ARTIFACT_DIR = "C:/Users/resan/.gemini/antigravity/brain/bad99014-08f4-4dce-a322-986b18efdbdb";

async function main() {
  console.log("Launching Microsoft Edge via Playwright...");
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
  });

  const consoleLogs = [];
  const networkErrors = [];

  // 1. Home desktop (1440x900)
  console.log("Capturing Home Desktop (1440x900)...");
  const pageDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  pageDesktop.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  pageDesktop.on("requestfailed", (req) => networkErrors.push(`FAILED: ${req.url()} (${req.failure()?.errorText})`));

  await pageDesktop.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await pageDesktop.waitForSelector("h1", { timeout: 10000 });
  await pageDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "real_home_desktop_1440.png"), fullPage: true });

  // 2. Home mobile (390x844)
  console.log("Capturing Home Mobile (390x844)...");
  const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pageMobile.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await pageMobile.waitForSelector("h1", { timeout: 10000 });
  await pageMobile.screenshot({ path: path.join(ARTIFACT_DIR, "real_home_mobile_390.png"), fullPage: true });

  // 3. Detail desktop (1440x900)
  console.log("Capturing Detail Desktop (1440x900)...");
  const pageDetailDesk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pageDetailDesk.goto("http://localhost:3000/places/1", { waitUntil: "networkidle" });
  await pageDetailDesk.waitForSelector("h1", { timeout: 10000 });
  await pageDetailDesk.screenshot({ path: path.join(ARTIFACT_DIR, "real_detail_desktop_1440.png"), fullPage: true });

  // 4. Detail mobile (390x844)
  console.log("Capturing Detail Mobile (390x844)...");
  const pageDetailMob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pageDetailMob.goto("http://localhost:3000/places/1", { waitUntil: "networkidle" });
  await pageDetailMob.waitForSelector("h1", { timeout: 10000 });
  await pageDetailMob.screenshot({ path: path.join(ARTIFACT_DIR, "real_detail_mobile_390.png"), fullPage: true });

  await browser.close();

  console.log("=== BROWSER DIAGNOSTIC LOGS ===");
  console.log("Console messages:", consoleLogs.length);
  consoleLogs.forEach((l) => console.log("  ", l));
  console.log("Network errors:", networkErrors.length);
  networkErrors.forEach((e) => console.log("  ", e));
  console.log("Screenshots captured successfully!");
}

main().catch((err) => {
  console.error("CAPTURE ERROR:", err);
  process.exit(1);
});
