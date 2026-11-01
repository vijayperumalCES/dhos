import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./helpers";

test("agents: a developer has no access", async ({ page }) => {
  await signIn(page, USERS.developer);
  await expect(page.getByRole("link", { name: "AI Agents" })).toHaveCount(0);
  await page.goto("/agents");
  await expect(page.getByText("You don't have access")).toBeVisible();
});

test("agents: another tenant starts with agents switched off", async ({ page }) => {
  await signIn(page, USERS.otherTenant);
  await page.goto("/agents");
  await expect(page.getByText("AI agents are switched off for this organization")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run" })).toHaveCount(0);
});

test("agents: an administrator configures but cannot run or see anyone's runs", async ({ page }) => {
  await signIn(page, USERS.orgAdmin);
  await page.goto("/agents");
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My runs" })).toHaveCount(0);
  await page.goto("/agents/usage");
  await expect(page.getByText("Token budget")).toBeVisible();
  await expect(page.getByText("never what anyone asked or received")).toBeVisible();
});

test("agents: project health run cites its sources", async ({ page }) => {
  await signIn(page, USERS.projectManager);
  await page.goto("/agents");
  const card = page.locator("div", { has: page.getByRole("heading", { name: "Project Health" }) }).last();
  await card.getByRole("button", { name: "Run" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /Project/ }).click();
  await page.getByRole("option", { name: /NW-PAY/ }).click();
  await dialog.getByRole("button", { name: "Run agent" }).click();
  await page.waitForURL(/\/agents\/runs\/[0-9a-f-]+/);
  await expect(page.getByText("Findings")).toBeVisible();
  await expect(page.getByText("Evidence:").first()).toBeVisible();
  await expect(page.getByText("Produced by the built-in rule-based provider")).toBeVisible();
  await expect(page.getByText("Succeeded")).toBeVisible();
});

test("agents: proposals need a different person, and approval creates the work item as the approver", async ({ browser }) => {
  // The seed leaves two proposals from Arjun. He may not decide them.
  const pm = await (await browser.newContext()).newPage();
  await signIn(pm, USERS.projectManager);
  await pm.goto("/agents/approvals");
  await expect(pm.getByText("You requested this; someone else must decide.").first()).toBeVisible();
  await expect(pm.getByRole("button", { name: "Approve" })).toHaveCount(0);

  const head = await (await browser.newContext()).newPage();
  await signIn(head, USERS.deliveryHead);
  await head.goto("/agents/approvals");
  const item = head.locator("li", { hasText: "Export ledger entries to CSV" }).first();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(head.getByText(/Approved\. Created NW-PAY-\d+\./)).toBeVisible();
  await head.goto("/projects");
  await head.getByRole("link", { name: /NW-PAY/ }).first().click();
});
