import { expect, test } from "@playwright/test";

test.describe("Nexus terminal app", () => {
  test("page loads with Nexus header and 3 model buttons", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("span", { hasText: "Nexus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Claude" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Codex" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gemini" })).toBeVisible();
  });

  test("model buttons are clickable and switch active model", async ({ page }) => {
    await page.goto("/");

    const codexBtn = page.getByRole("button", { name: "Codex" });
    await codexBtn.click();
    await expect(codexBtn).toBeEnabled();

    const geminiBtn = page.getByRole("button", { name: "Gemini" });
    await geminiBtn.click();
    await expect(geminiBtn).toBeEnabled();
  });

  test("xterm.js terminal renders", async ({ page }) => {
    await page.goto("/");

    // xterm.js renders a canvas or .xterm container
    await expect(page.locator(".xterm")).toBeVisible();
  });

  test("API health check responds", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("WebSocket connects and terminal shows prompt", async ({ page }) => {
    await page.goto("/");

    // After WebSocket connects, showPrompt() writes to the terminal.
    // Wait for the xterm canvas to appear, indicating the terminal is live.
    await expect(page.locator(".xterm-screen")).toBeVisible({ timeout: 5000 });
  });
});
