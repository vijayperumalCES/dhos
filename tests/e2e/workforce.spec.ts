import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./helpers";

const unique = () => Date.now().toString(36);

/** A weekday next year that changes between runs, so leave requests don't overlap earlier runs. */
function nextYearWeekday(): { iso: string; label: string } {
  const year = new Date().getFullYear() + 1;
  const d = new Date(Date.UTC(year, 0, 5 + (Math.floor(Date.now() / 1000) % 330)));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const iso = d.toISOString().slice(0, 10);
  const label = `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${year}`;
  return { iso, label };
}

test("attendance: a developer checks in and out", async ({ page }) => {
  await signIn(page, USERS.developer);
  await page.goto("/attendance");
  if (await page.getByRole("button", { name: "Check in at office" }).isVisible()) {
    await page.getByRole("button", { name: "Check in at office" }).click();
    await expect(page.getByText("Checked in.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check out" })).toBeVisible();
  }
  if (await page.getByRole("button", { name: "Check out" }).isVisible()) {
    await page.getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText("Checked out.", { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Done for today/)).toBeVisible();
  // A developer has no reports, so no team exceptions.
  await expect(page.getByText("Team exceptions")).toHaveCount(0);
});

test("leave: request, HR approval and cancellation", async ({ page }) => {
  const day = nextYearWeekday();
  await signIn(page, USERS.developer);
  await page.goto("/leave");
  await expect(page.getByText(/My balances/)).toBeVisible();
  await page.getByRole("button", { name: "Request leave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Unpaid leave" }).click();
  await dialog.getByLabel("From").fill(day.iso);
  await dialog.getByLabel("To").fill(day.iso);
  await dialog.getByLabel("Note for your manager").fill(`E2E ${unique()}`);
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Leave requested\./)).toBeVisible();

  await signIn(page, USERS.hr);
  await page.goto("/leave");
  const row = page.locator("tr", { hasText: "Dev Kumar" }).filter({ hasText: day.label });
  await row.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText("Leave approved.")).toBeVisible();

  await signIn(page, USERS.developer);
  await page.goto("/leave");
  const mine = page.locator("tr", { hasText: day.label });
  await expect(mine.getByText("Approved")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await mine.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Leave cancelled.")).toBeVisible();
});

test("timesheets: log, submit and return for changes", async ({ page }) => {
  const note = `E2E ${unique()}`;
  await signIn(page, USERS.developer);
  await page.goto("/timesheets");
  // Re-runs find last run's week submitted or returned.
  if (await page.getByRole("button", { name: "Recall" }).isVisible()) {
    await page.getByRole("button", { name: "Recall" }).click();
    await expect(page.getByText(/Timesheet recalled/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Log time" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Training" }).click();
  await dialog.getByLabel("Hours").fill("0.5");
  await dialog.getByLabel("Note").fill(note);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Time logged.")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("button", { name: "Submit week" }).click();
  await expect(page.getByText("Timesheet submitted for approval.")).toBeVisible();

  await signIn(page, USERS.engineeringManager);
  await page.goto("/timesheets");
  const row = page.locator("div[data-slot=card]").filter({ hasText: "Timesheets to approve" }).locator("tr", { hasText: "Dev Kumar" }).last();
  await row.getByRole("button", { name: /^Return/ }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Please split by task.");
  await page.getByRole("dialog").getByRole("button", { name: "Return" }).click();
  await expect(page.getByText("Timesheet returned for changes.")).toBeVisible();
  await expect(page.getByText("Team status for this week")).toBeVisible();
});

test("resource planning flags the over-allocated engineer and is hidden from developers", async ({ page }) => {
  await signIn(page, USERS.deliveryHead);
  await page.goto("/resources");
  await expect(page.locator("tr", { hasText: "Dev Kumar" }).getByText("Over-allocated")).toBeVisible();

  await signIn(page, USERS.developer);
  await expect(page.getByRole("link", { name: "Resource Planning" })).toHaveCount(0);
  await page.goto("/resources");
  await expect(page.getByText("You don't have access")).toBeVisible();

  await signIn(page, USERS.client);
  await page.goto("/attendance");
  await expect(page.getByText("You don't have access")).toBeVisible();
});

test("HR manages holidays in workforce settings", async ({ page }) => {
  const name = `E2E holiday ${unique()}`;
  await signIn(page, USERS.hr);
  await page.goto("/admin/workforce");
  const calendar = page.locator("div.rounded-lg.border", { hasText: "Standard (Mon–Fri)" });
  await calendar.getByLabel("Holiday date").fill(`${new Date().getFullYear() + 1}-03-03`);
  await calendar.getByLabel("Holiday name").fill(name);
  await calendar.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText("Holiday added.")).toBeVisible();
  await page.locator("li", { hasText: name }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Holiday removed.")).toBeVisible();
});
