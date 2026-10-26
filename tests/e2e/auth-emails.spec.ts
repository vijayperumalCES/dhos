import { expect, test } from "@playwright/test";

import { latestAuthLink, signIn, USERS } from "./helpers";

const unique = () => Date.now().toString(36);

test("a forgotten password can be reset from the emailed link", async ({ page }) => {
  const email = `reset-${unique()}@example.test`;
  // Local stack has email confirmation off, so sign-up signs the user in directly.
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Reset Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("FirstPass1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.context().clearCookies();

  const since = new Date(Date.now() - 1000);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByText("If an account exists for that email, a reset link is on its way.")).toBeVisible();

  await page.goto(await latestAuthLink(email, since));
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel(/^New password/).fill("SecondPass1234");
  await page.getByLabel("Confirm new password").fill("SecondPass9999");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
  await page.getByLabel("Confirm new password").fill("SecondPass1234");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("SecondPass1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
});

test("an invited person receives an email, joins with the invited role and sets a password", async ({ page }) => {
  const email = `invitee-${unique()}@example.test`;
  const since = new Date(Date.now() - 1000);

  await signIn(page, USERS.orgAdmin);
  await page.goto("/admin/members");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Record invitation" }).click();
  await expect(page.getByText(`Invitation emailed to ${email}.`)).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText(/Emailed .* ago/).first()).toBeVisible();
  await page.context().clearCookies();

  await page.goto(await latestAuthLink(email, since));
  await expect(page.getByRole("heading", { name: "Welcome to Stride" })).toBeVisible();
  await expect(page.getByText("Northwind Delivery (Demo)")).toBeVisible();
  await page.getByLabel(/^New password/).fill("InviteePass123");
  await page.getByLabel("Confirm new password").fill("InviteePass123");
  await page.getByRole("button", { name: "Set password and continue" }).click();
  // Default invite role is Developer: no portfolio dashboard, lands on assigned projects.
  await page.waitForURL(/\/projects/);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("InviteePass123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/projects/);
});
