import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./helpers";

test("delivery head creates, governs and archives a project", async ({ page }) => {
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  await signIn(page, USERS.deliveryHead);

  // Create
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
  await page.getByLabel("Project code").fill(code.toLowerCase());
  await page.getByLabel("Project name").fill("End-to-end governance test");
  await page.getByLabel("Planned start").fill("2026-11-01");
  await page.getByLabel("Target end").fill("2026-10-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Target end date must be on or after the planned start date.")).toBeVisible();
  await page.getByLabel("Target end").fill("2027-03-31");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(code) })).toBeVisible();
  await expect(page.getByText("Proposed", { exact: true })).toBeVisible();

  // Duplicate code is rejected with a friendly message
  await page.goto("/projects/new");
  await page.getByLabel("Project code").fill(code);
  await page.getByLabel("Project name").fill("Duplicate");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Another project in this organization already uses that code.")).toBeVisible();
  await page.goBack();
  await page.goto(`/projects?q=${code}`);
  await page.getByRole("link", { name: "End-to-end governance test" }).click();

  // Lifecycle: only valid next stages are offered
  await page.getByRole("button", { name: "Change status" }).click();
  await page.getByRole("combobox", { name: "New status" }).click();
  await expect(page.getByRole("option")).toHaveText(["Approved", "Cancelled"]);
  await page.getByRole("option", { name: "Approved" }).click();
  await page.getByLabel(/Reason/).fill("Steering committee approval");
  await page.getByRole("dialog").getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

  // Health: red requires a reason
  await page.getByRole("button", { name: "Update health" }).click();
  await page.getByRole("combobox", { name: "Health" }).click();
  await page.getByRole("option", { name: "Red" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save health" }).click();
  await expect(page.getByText("Explain why the project is Amber or Red.")).toBeVisible();
  await page.getByLabel(/Reason/).fill("Key vendor contract unsigned");
  await page.getByRole("dialog").getByRole("button", { name: "Save health" }).click();
  await expect(page.getByText("Red — Key vendor contract unsigned")).toBeVisible();

  // History and audit
  await page.getByRole("tab", { name: "Status history" }).click();
  await expect(page.getByText("Proposed → Approved")).toBeVisible();
  await expect(page.getByText("Steering committee approval")).toBeVisible();
  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByText("Updated project by Priya Raman").first()).toBeVisible();

  // Archive and restore
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive project" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await page.goto(`/projects?q=${code}`);
  await expect(page.getByText("No projects match these filters")).toBeVisible();
  await page.goto(`/projects?q=${code}&archived=only`);
  await page.getByRole("link", { name: "End-to-end governance test" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Archived", { exact: true })).toHaveCount(0);
});

test("delivery head creates a team and adds a member", async ({ page }) => {
  const name = `E2E Team ${Date.now().toString(36)}`;
  await signIn(page, USERS.deliveryHead);
  await page.goto("/teams/new");
  await page.getByLabel("Team name").fill(name);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByLabel("Person").click();
  await page.getByRole("option", { name: "Dev Kumar" }).click();
  await page.getByLabel(/Role/).fill("Engineer");
  await page.getByRole("dialog").getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("dev@northwind.example")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});

test("command center shows persisted KPIs with definitions", async ({ page }) => {
  await signIn(page, USERS.deliveryHead);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Delivery Command Center" })).toBeVisible();
  await expect(page.getByText("Demo data.")).toBeVisible();
  await expect(page.getByText("Payments Platform Modernization")).toBeVisible();
  await page.getByRole("button", { name: 'How "Projects at risk" is calculated' }).click();
  await expect(page.getByText("count(in-flight projects where health in ('amber','red'))")).toBeVisible();
  await expect(page.getByText("Not yet measured")).toBeVisible();
});
