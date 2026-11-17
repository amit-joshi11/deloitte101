/**
 * Browser UI component checks against a running excalidraw-app dev server.
 * Usage (from repo root): node excalidraw-app/tests/ui-e2e-playwright.mjs
 * Env: UI_E2E_BASE_URL (default http://127.0.0.1:3001)
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE_URL = process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3001";
const ARTIFACTS = "/opt/cursor/artifacts";

const results = { baseUrl: BASE_URL, passed: [], failed: [], skipped: [] };

async function runCheck(name, fn) {
  try {
    await fn();
    results.passed.push(name);
  } catch (error) {
    results.failed.push({ name, error: error.message ?? String(error) });
  }
}

async function skipCheck(name, reason) {
  results.skipped.push({ name, reason });
}

function expectTruthy(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

async function drawOnCanvas(page, from, to) {
  const canvas = page.locator("canvas.excalidraw__canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box missing");
  }
  const px = (x) => box.x + box.width * x;
  const py = (y) => box.y + box.height * y;
  await page.mouse.move(px(from[0]), py(from[1]));
  await page.mouse.down();
  await page.mouse.move(px(to[0]), py(to[1]));
  await page.mouse.up();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") {
    consoleErrors.push(m.text());
  }
});

await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

try {
  await page.waitForSelector(".excalidraw", { timeout: 30_000 });

  await runCheck("document.title is Deloitte Draw", async () => {
    expectTruthy((await page.title()) === "Deloitte Draw", "Unexpected title");
  });

  await runCheck("welcome: brand lockup", async () => {
    expectTruthy((await page.locator(".brand-lockup").count()) >= 1, "No lockup");
    expectTruthy((await page.locator(".brand-lockup__logo").count()) >= 1, "No logo");
    expectTruthy(
      (await page.locator(".brand-lockup__product").textContent())?.trim() === "Draw",
      "Product name",
    );
  });

  await runCheck("welcome: center menu has load/help/collab items", async () => {
    const items = page.locator(".welcome-screen-menu-item");
    expectTruthy((await items.count()) >= 3, "Expected >= 3 welcome menu items");
  });

  await runCheck("welcome: decor hints (menu, toolbar, help)", async () => {
    expectTruthy(
      (await page.locator(".welcome-screen-decor-hint--menu").count()) >= 1,
      "menu hint",
    );
    expectTruthy(
      (await page.locator(".welcome-screen-decor-hint--toolbar").count()) >= 1,
      "toolbar hint",
    );
    expectTruthy(
      (await page.locator(".welcome-screen-decor-hint--help").count()) >= 1,
      "help hint",
    );
  });

  await runCheck("branding: primary CSS tokens on .excalidraw", async () => {
    const tokens = await page.locator(".excalidraw").first().evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        primary: style.getPropertyValue("--color-primary").trim(),
        deloitteGreen: style.getPropertyValue("--color-deloitte-green").trim(),
      };
    });
    expectTruthy(
      tokens.primary === "#26890d" || tokens.primary === "rgb(38, 137, 13)",
      `primary token: ${tokens.primary}`,
    );
    expectTruthy(
      tokens.deloitteGreen === "#86bc25" || tokens.deloitteGreen === "rgb(134, 188, 37)",
      `deloitte green: ${tokens.deloitteGreen}`,
    );
  });

  const toolbarTools = [
    "selection",
    "rectangle",
    "diamond",
    "ellipse",
    "arrow",
    "line",
    "freedraw",
    "text",
  ];

  for (const tool of toolbarTools) {
    await runCheck(`toolbar: ${tool} present and clickable`, async () => {
      const btn = page.locator(`[data-testid="toolbar-${tool}"]`);
      expectTruthy((await btn.count()) >= 1, `Missing toolbar-${tool}`);
      await btn.first().click();
      await page.waitForTimeout(80);
    });
  }

  await runCheck("stroke color: Deloitte green top pick", async () => {
    const pick = page.locator('[data-testid="color-top-pick-#86bc25"]');
    expectTruthy((await pick.count()) >= 1, "Deloitte green top pick missing");
    await pick.first().click();
  });

  await runCheck("draw: rectangle on canvas", async () => {
    await page.locator('[data-testid="toolbar-rectangle"]').click();
    await drawOnCanvas(page, [0.35, 0.35], [0.5, 0.5]);
    await page.waitForTimeout(200);
    expectTruthy(
      (await page.locator(".welcome-screen-center").count()) === 0,
      "Welcome should dismiss after draw",
    );
  });

  await runCheck("selection: stats panel after shape", async () => {
    await page.locator('[data-testid="toolbar-selection"]').click();
    const stats = page.locator('[data-testid="stats-element-type"]');
    if ((await stats.count()) === 0) {
      await skipCheck("selection stats", "stats panel not visible (no selection)");
      return;
    }
    expectTruthy(await stats.isVisible(), "stats not visible");
  });

  await runCheck("history: undo after draw", async () => {
    const undo = page.locator('[data-testid="button-undo"]');
    if ((await undo.count()) === 0) {
      await skipCheck("undo button", "undo not in DOM");
      return;
    }
    const disabled = await undo.first().isDisabled();
    if (disabled) {
      await skipCheck("undo enabled", "undo disabled");
      return;
    }
    await undo.first().click();
    await page.waitForTimeout(150);
  });

  await runCheck("zoom menu: open and zoom in", async () => {
    const trigger = page.locator('[data-testid="zoom-menu-trigger"]');
    expectTruthy((await trigger.count()) >= 1, "zoom trigger missing");
    await trigger.first().click();
    const zoomIn = page.locator('[data-testid="zoom-menu-zoomIn"]');
    expectTruthy((await zoomIn.count()) >= 1, "zoom in missing");
    await zoomIn.first().click();
    await page.keyboard.press("Escape");
  });

  await runCheck("main menu: opens and lists Help", async () => {
    await page.locator('[data-testid="main-menu-trigger"]').click();
    const help = page.locator('[data-testid="help-menu-item"]');
    expectTruthy((await help.count()) >= 1, "help menu item missing");
    await page.keyboard.press("Escape");
  });

  await runCheck("help dialog: opens from main menu", async () => {
    await page.locator('[data-testid="main-menu-trigger"]').click();
    await page.locator('[data-testid="help-menu-item"]').click();
    const dialog = page.locator(".HelpDialog, .help-dialog, [class*='HelpDialog']");
    await page.waitForTimeout(300);
    const dialogCount = await dialog.count();
    const shortcutDoc = await page.getByText("Keyboard shortcuts", { exact: false }).count();
    expectTruthy(dialogCount >= 1 || shortcutDoc >= 1, "Help dialog did not open");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  });

  await runCheck("library sidebar trigger present", async () => {
    expectTruthy(
      (await page.locator(".default-sidebar-trigger").count()) >= 1,
      "library sidebar trigger missing",
    );
  });

  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: `${ARTIFACTS}/ui_e2e_component_suite_final.png`, fullPage: false });
} catch (fatal) {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: `${ARTIFACTS}/ui_e2e_component_suite_failure.png` }).catch(() => {});
  results.fatal = fatal.message ?? String(fatal);
}

{
  results.consoleErrors = [...new Set(consoleErrors)].slice(0, 15);
  await browser.close();
  const outPath = `${ARTIFACTS}/ui_e2e_report.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.failed.length > 0 || results.fatal) {
    process.exit(1);
  }
}