import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./helpers";

test("automation: a developer has no access to rules, webhooks or integrations", async ({ page }) => {
  await signIn(page, USERS.developer);
  await expect(page.getByRole("link", { name: "Workflow Automation" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Integrations" })).toHaveCount(0);
  await page.goto("/automation");
  await expect(page.getByText("You don't have access")).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByText("You don't have access")).toBeVisible();
  // Everyone has their own inbox.
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("notifications: a person sees their own, can read them, and sets preferences", async ({ page }) => {
  await signIn(page, USERS.projectManager);
  await page.goto("/notifications");
  await expect(page.getByText("Escalation overdue: sample")).toBeVisible();
  await expect(page.getByTestId("unread-count")).toBeVisible();

  await page.getByRole("button", { name: "Mark as read" }).first().click();
  await page.getByRole("button", { name: "Mark all read" }).first().click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByTestId("unread-count")).toHaveCount(0);

  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByText("Timesheet not submitted")).toBeVisible();

  await page.getByRole("checkbox", { name: "Workforce email" }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
});

test("automation: a delivery head can read rules but not change anything", async ({ page }) => {
  await signIn(page, USERS.deliveryHead);
  await page.goto("/automation");
  await expect(page.getByText("Red health reaches the delivery head")).toBeVisible();
  await expect(page.getByRole("button", { name: "New rule" })).toHaveCount(0);
  await page.goto("/automation/webhooks");
  await expect(page.getByText("Delivery channel (demo, paused)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add webhook" })).toHaveCount(0);
});

test("automation: an administrator creates a webhook and sees its secret exactly once", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/automation/webhooks");
  const name = `E2E hook ${Date.now()}`;
  await page.getByRole("button", { name: "Add webhook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("URL").fill("https://example.com/hooks/e2e");
  await dialog.getByRole("button", { name: "Create webhook" }).click();
  await expect(page.getByTestId("webhook-secret")).toContainText("whsec_");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(name)).toBeVisible();
  // The secret is not rendered anywhere on the list afterwards.
  await page.reload();
  await expect(page.getByText("whsec_")).toHaveCount(0);

  // Plain http is refused before it reaches the database.
  await page.getByRole("button", { name: "Add webhook" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Insecure");
  await page.getByRole("dialog").getByLabel("URL").fill("http://example.com/x");
  await page.getByRole("dialog").getByRole("button", { name: "Create webhook" }).click();
  await expect(page.getByText("Enter a full URL starting with https://")).toBeVisible();
});

test("automation: a rule shows its definition, runs and version history", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/automation");
  await page.getByRole("link", { name: "Red health reaches the delivery head" }).click();
  await expect(page.getByText("Definition (version 1)")).toBeVisible();
  await expect(page.getByText("Version history")).toBeVisible();
  await expect(page.getByText(/When “Project health changed”/).first()).toBeVisible();
});

test("integrations: syncing a mock connection reports the external status change", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/integrations");
  await page.getByRole("link", { name: "Northwind GitHub (mock)" }).click();
  await expect(page.getByRole("link", { name: "northwind/payments#101" })).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/Synced 2 link\(s\)/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "closed" }).first()).toBeVisible();
});

test("scheduler: an administrator can run the worker and sees the heartbeat", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/automation/scheduler");
  await expect(page.getByText("Overdue escalations")).toBeVisible();
  await page.getByRole("button", { name: "Process now" }).click();
  await expect(page.getByText(/Processed \d+ event\(s\)/)).toBeVisible();
  await expect(page.getByText("The scheduler is running")).toBeVisible();
  await page.goto("/automation/events");
  await expect(page.getByText("Event stream").first()).toBeVisible();
});

test("automation: another tenant sees none of this organization's rules, endpoints or connections", async ({ page }) => {
  await signIn(page, USERS.otherTenant);
  await page.goto("/automation/webhooks");
  await expect(page.getByText("Delivery channel (demo, paused)")).toHaveCount(0);
  await page.goto("/integrations");
  await expect(page.getByText("Northwind GitHub (mock)")).toHaveCount(0);
});
