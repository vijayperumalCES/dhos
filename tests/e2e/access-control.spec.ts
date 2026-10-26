import { expect, test } from "@playwright/test";

import { expectProjectCodes, signIn, USERS } from "./helpers";

test("signed-out visitors are redirected to sign in", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
});

test("invalid credentials show a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.developer);
  await page.getByLabel("Password").fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("developer sees only assigned projects and no portfolio dashboard", async ({ page }) => {
  await signIn(page, USERS.developer);
  await expect(page).toHaveURL(/\/projects$/); // dashboard redirects without dashboard.portfolio.view
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await expectProjectCodes(page, ["NW-MOB", "NW-PAY"]);
});

test("client stakeholder sees only the shared project and no internal teams", async ({ page }) => {
  await signIn(page, USERS.client);
  await expectProjectCodes(page, ["NW-MOB"]);
  await page.goto("/teams");
  await expect(page.getByText("You don't have access")).toBeVisible();
});

test("org admin manages members but does not see project data", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/projects");
  await expect(page.getByText("You don't have access")).toBeVisible();
  await page.goto("/admin/members");
  await expect(page.getByText(/^Members \(\d+\)$/)).toBeVisible();
  await expect(page.getByText("new.hire@northwind.example")).toBeVisible();
});

test("tenants are isolated", async ({ page }) => {
  await signIn(page, USERS.otherTenant);
  await expectProjectCodes(page, ["GX-TOOLS"]);
  await page.goto("/search?q=NW");
  await expect(page.getByText("No matches")).toBeVisible();

  await signIn(page, USERS.deliveryHead);
  await page.goto("/search?q=GX-TOOLS");
  await expect(page.getByText("No matches")).toBeVisible();
  await page.goto("/search?q=Globex");
  await expect(page.getByText("No matches")).toBeVisible();
});
