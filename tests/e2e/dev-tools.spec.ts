/**
 * Developer Tools E2E Tests
 * Tests the /dev page functionality including user management and session handling
 */

import { expect, test } from "@playwright/test";

test.describe("Developer Tools Page", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we're in a clean state
    await page.context().clearCookies();
  });

  test("should load dev tools page successfully", async ({ page }) => {
    await page.goto("/dev");

    // Check page title and main elements
    await expect(page).toHaveTitle("Developer Tools");
    await expect(page.locator("h1")).toContainText("🛠️ Developer Tools");
    await expect(page.locator('text="Development & Test Environment Only"')).toBeVisible();
    await expect(page.locator('text="ENV: development"')).toBeVisible();
  });

  test("should display current session status when not logged in", async ({ page }) => {
    await page.goto("/dev");

    // Check session status section
    await expect(page.locator('text="Current Session Status"')).toBeVisible();
    await expect(page.locator('text="Not logged in"')).toBeVisible();
  });

  test("should load admin email configuration", async ({ page }) => {
    await page.goto("/dev");

    // Wait for admin section to load
    await expect(page.locator('text="Admin Account"')).toBeVisible();

    // Check if admin email is displayed
    const adminEmailSection = page.locator('[class*="card"]:has-text("Admin Account")');
    await expect(adminEmailSection.locator("code")).toBeVisible();
  });

  test("should display user list", async ({ page }) => {
    await page.goto("/dev");

    // Check user list section
    await expect(page.locator('text="All Users"')).toBeVisible();

    // Wait for users to load
    await page.waitForTimeout(1000);

    // Should show either users or "No users found"
    const usersTable = page.locator("table");
    const noUsersMessage = page.locator('text="No users found"');

    await expect(usersTable.or(noUsersMessage)).toBeVisible();
  });

  test("should create and login as admin account", async ({ page }) => {
    await page.goto("/dev");

    // Click create/login admin button
    const adminButton = page.locator('button:has-text("Create/Login as Admin")');
    await expect(adminButton).toBeVisible();

    await adminButton.click();

    // Wait for login to complete and page to refresh
    await page.waitForLoadState("networkidle");

    // Check that session status now shows logged in user
    await expect(page.locator('text="Not logged in"')).not.toBeVisible();

    // Should show user info in session status
    const sessionCard = page.locator('[class*="card"]:has-text("Current Session Status")');
    await expect(sessionCard.locator('text="User ID:"')).toBeVisible();
    await expect(sessionCard.locator('text="Email:"')).toBeVisible();
  });

  test("should switch between users", async ({ page }) => {
    await page.goto("/dev");

    // Wait for user list to load
    await page.waitForTimeout(1000);

    // Check if there are users in the table
    const switchButtons = page.locator('button:has-text("Switch")');
    const count = await switchButtons.count();

    if (count > 0) {
      // Click the first switch button
      await switchButtons.first().click();

      // Wait for page to refresh after login
      await page.waitForLoadState("networkidle");

      // Verify we're now logged in
      await expect(page.locator('text="Not logged in"')).not.toBeVisible();

      // Should show current user in the table
      await expect(page.locator('text="Current"')).toBeVisible();
    } else {
      console.log("No users available for switching test");
    }
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/dev");

    // First login as admin
    const adminButton = page.locator('button:has-text("Create/Login as Admin")');
    if (await adminButton.isVisible()) {
      await adminButton.click();
      await page.waitForLoadState("networkidle");
    }

    // Now test logout
    const logoutButton = page.locator('button:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // Wait for logout to complete
      await page.waitForLoadState("networkidle");

      // Should be back to not logged in state
      await expect(page.locator('text="Not logged in"')).toBeVisible();
      await expect(logoutButton).not.toBeVisible();
    }
  });

  test("should handle API endpoints correctly", async ({ page }) => {
    // Test config API
    const configResponse = await page.request.get("/api/dev/config");
    expect(configResponse.ok()).toBeTruthy();

    const configData = await configResponse.json();
    expect(configData.success).toBe(true);
    expect(configData.adminEmail).toBeDefined();
    expect(configData.environment).toBe("development");

    // Test users API
    const usersResponse = await page.request.get("/api/dev/users");
    expect(usersResponse.ok()).toBeTruthy();

    const usersData = await usersResponse.json();
    expect(usersData.success).toBe(true);
    expect(Array.isArray(usersData.users)).toBe(true);
  });

  test("should test login API endpoint", async ({ page }) => {
    // Test dev login API
    const loginResponse = await page.request.post("/api/dev/login", {
      data: { email: "test-user@example.com" },
    });

    expect(loginResponse.ok()).toBeTruthy();

    const loginData = await loginResponse.json();
    expect(loginData.success).toBe(true);
    expect(loginData.user).toBeDefined();
    expect(loginData.user.email).toBe("test-user@example.com");
  });

  test("should be responsive on mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dev");

    // Check that main elements are still visible and accessible
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('text="Current Session Status"')).toBeVisible();
    await expect(page.locator('text="Admin Account"')).toBeVisible();
    await expect(page.locator('text="All Users"')).toBeVisible();
  });

  test("should show success/error messages", async ({ page }) => {
    await page.goto("/dev");

    // Try to create admin account and look for success message
    const adminButton = page.locator('button:has-text("Create/Login as Admin")');
    if (await adminButton.isVisible()) {
      await adminButton.click();

      // Look for success alert
      await expect(page.locator(".alert-success")).toBeVisible({ timeout: 5000 });
    }
  });
});
