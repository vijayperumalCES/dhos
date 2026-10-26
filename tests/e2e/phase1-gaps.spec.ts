import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./helpers";

const unique = () => Date.now().toString(36);

test("org admin creates, edits and deletes a custom role", async ({ page }) => {
  const suffix = unique();
  const name = `Release Auditor ${suffix}`;
  await signIn(page, USERS.orgAdmin);
  await page.goto("/admin/roles");
  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await expect(dialog.getByLabel("Key", { exact: true })).toHaveValue(/^release_auditor_[a-z_]+$/);
  await dialog.getByRole("button", { name: "Create role" }).click();
  await expect(dialog.getByText("Choose at least one permission.")).toBeVisible();
  await dialog.getByText("audit.read", { exact: true }).click();
  await dialog.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByText(`Role “${name}” created.`)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: new RegExp(name) })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await page.getByRole("dialog").getByText("team.read", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("Role updated.")).toBeVisible();

  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete role" }).click();
  await expect(page.getByText("Role deleted.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: new RegExp(name) })).toHaveCount(0);
});

test("departments and reporting lines appear in the org chart", async ({ page }) => {
  const dept = `Ops ${unique()}`;
  await signIn(page, USERS.orgAdmin);
  await page.goto("/admin/departments");
  await page.getByRole("button", { name: "New department" }).click();
  await page.getByRole("dialog").getByLabel(/^Name/).fill(dept);
  await page.getByRole("dialog").getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("Department created.")).toBeVisible();
  await expect(page.getByText(dept, { exact: true })).toBeVisible();

  await page.goto("/admin/members");
  await page.getByRole("button", { name: "Actions for Sofia Rossi" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Department" }).click();
  await page.getByRole("option", { name: dept }).click();
  await dialog.getByRole("combobox", { name: "Reports to" }).click();
  await page.getByRole("option", { name: "Arjun Mehta" }).click();
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Member details updated.")).toBeVisible();

  await page.goto("/admin/org-chart");
  const arjun = page.getByRole("treeitem").filter({ has: page.getByText("Arjun Mehta", { exact: true }) }).first();
  await expect(arjun.getByText("Sofia Rossi", { exact: true })).toBeVisible();

  // Making Arjun report to Sofia would create a cycle and is refused.
  await page.goto("/admin/members");
  await page.getByRole("button", { name: "Actions for Arjun Mehta" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Reports to" }).click();
  await page.getByRole("option", { name: "Sofia Rossi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("That change would make someone report to themselves.")).toBeVisible();
});

test("projects can be imported from CSV after a validated preview", async ({ page }) => {
  const code = `IMP-${unique().toUpperCase()}`.slice(0, 20);
  const bad = [
    "code,name,client,project_manager_email,target_end_date",
    `${code},Imported project,CONTOSO,arjun@northwind.example,2027-06-30`,
    `${code},Duplicate code,NOPE,nobody@example.com,not-a-date`,
  ].join("\n");

  await signIn(page, USERS.deliveryHead);
  await page.goto("/projects/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await expect(page.getByText("1 ready · 1 with errors")).toBeVisible();
  await expect(page.getByText("Client “NOPE” was not found.")).toBeVisible();
  await expect(page.getByText("Project manager “nobody@example.com” was not found.")).toBeVisible();
  await expect(page.getByText(`Code ${code} appears more than once in this file.`)).toBeVisible();
  await expect(page.getByRole("button", { name: /Import 1 project/ })).toBeDisabled();

  const good = bad.split("\n").slice(0, 2).join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "good.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await expect(page.getByText("1 ready · 0 with errors")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 project" }).click();
  await page.waitForURL(/\/projects\?status=proposed/);
  await page.goto(`/projects?q=${code}`);
  await expect(page.getByRole("link", { name: "Imported project" })).toBeVisible();
});

test("CSV exports contain only the caller's tenant data", async ({ page }) => {
  await signIn(page, USERS.deliveryHead);
  const projects = await page.request.get("/api/export/projects");
  expect(projects.headers()["content-type"]).toContain("text/csv");
  expect(projects.headers()["content-disposition"]).toMatch(/attachment; filename="northwind-demo-projects-\d{4}-\d{2}-\d{2}\.csv"/);
  const body = await projects.text();
  expect(body).toContain("NW-PAY");
  expect(body).not.toContain("GX-TOOLS");

  const members = await page.request.get("/api/export/members");
  const csv = await members.text();
  expect(csv.split("\r\n")[0]).toContain("name,email,job_title,department,manager_email,roles,status,joined_at");
  expect(csv).toContain("priya@northwind.example");
  expect(csv).not.toContain("alex@globex.example");

  await signIn(page, USERS.developer);
  const denied = await page.request.get("/api/export/members");
  expect(denied.status()).toBe(200); // developers can read the directory
  await signIn(page, USERS.client);
  expect((await page.request.get("/api/export/members")).status()).toBe(403);
});
