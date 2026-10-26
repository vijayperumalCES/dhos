import { expect, test, type Page } from "@playwright/test";

import { signIn, USERS } from "./helpers";

const unique = () => Date.now().toString(36);

async function projectPath(page: Page, code: string) {
  await page.goto(`/projects?q=${code}&status=all`);
  const href = await page.locator(`tbody tr:has-text("${code}") a`).first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

test("backlog quick add, item editing, comments and links", async ({ page }) => {
  const title = `E2E story ${unique()}`;
  await signIn(page, USERS.deliveryHead);
  const base = await projectPath(page, "NW-DWH");

  await page.goto(`${base}/backlog`);
  await page.waitForLoadState("networkidle");
  const backlog = page.locator("div[data-slot=card]").filter({ hasText: "Not scheduled" });
  await backlog.getByLabel("New item title").fill(title);
  await backlog.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(/NW-DWH-\d+ created\./)).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Story points").fill("5");
  await page.getByRole("combobox", { name: "Assignee" }).click();
  await page.getByRole("option", { name: "Sofia Rossi" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("changed assignee")).toBeVisible();

  await page.getByLabel("Add a comment").fill("Looks good to start.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText("Looks good to start.")).toBeVisible();

  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("URL").fill("https://github.com/example/repo/pull/42");
  await page.getByLabel("Link title").fill("PR 42");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("link", { name: /PR 42/ })).toBeVisible();
  await expect(page.getByText("changed story points")).toBeVisible();
});

test("sprint lifecycle: plan, fill, start, complete and record velocity", async ({ page }) => {
  const sprint = `E2E Sprint ${unique()}`;
  await signIn(page, USERS.deliveryHead);
  const base = await projectPath(page, "NW-DWH");

  await page.goto(`${base}/sprints`);
  // A previous failed run may have left a sprint active; complete it first.
  if (await page.getByRole("button", { name: "Complete sprint" }).isVisible()) {
    await page.getByRole("button", { name: "Complete sprint" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Complete sprint" }).click();
    await expect(page.getByText(/Sprint completed\./)).toBeVisible();
  }
  await page.getByRole("button", { name: "Plan sprint" }).click();
  await page.getByRole("dialog").getByLabel(/^Name/).fill(sprint);
  await page.getByRole("dialog").getByRole("button", { name: "Save sprint" }).click();
  await expect(page.getByText("Sprint planned.")).toBeVisible();

  await page.goto(`${base}/backlog`);
  await page.waitForLoadState("networkidle"); // typing before hydration would be lost on a cold dev server
  const section = page.locator("div[data-slot=card]").filter({ hasText: sprint });
  await section.getByLabel("New item title").fill(`Sprint work ${unique()}`);
  await expect(section.getByRole("button", { name: "Add item" })).toBeEnabled();
  await section.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText(/NW-DWH-\d+ created\./)).toBeVisible();
  await expect(section.getByText("1 items")).toBeVisible();

  await page.goto(`${base}/sprints`);
  await page.getByRole("row").filter({ hasText: sprint }).getByRole("button", { name: "Start sprint" }).click();
  await expect(page.getByText(/Sprint started\./)).toBeVisible();
  await expect(page.getByText(sprint).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Burndown for/ })).toBeVisible();

  await page.getByRole("button", { name: "Complete sprint" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete sprint" }).click();
  await expect(page.getByText(/Sprint completed\. Unfinished items returned to the backlog\./)).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(sprint) })).toBeVisible();
});

test("board cards move between columns with the keyboard", async ({ page }) => {
  const title = `Board card ${unique()}`;
  await signIn(page, USERS.deliveryHead);
  const base = await projectPath(page, "NW-DWH");
  await page.goto(`${base}/board?view=all`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New item title").fill(title);
  await page.getByRole("button", { name: "Add item" }).click();
  const backlogColumn = page.getByRole("listitem", { name: /^Backlog,/ });
  await expect(backlogColumn.getByText(title)).toBeVisible();

  const card = backlogColumn.locator("li[aria-roledescription=sortable]").filter({ hasText: title });
  await card.focus();
  // dnd-kit processes each keyboard step asynchronously; give it a moment between keys.
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await expect(page.getByRole("listitem", { name: /^Ready,/ }).getByText(title)).toBeVisible();
  await expect(page.getByText(/moved to Ready\./)).toBeVisible();

  // Persisted: survives a reload.
  await page.reload();
  await expect(page.getByRole("listitem", { name: /^Ready,/ }).getByText(title)).toBeVisible();
});

test("milestones, baselines and schedule variance", async ({ page }) => {
  const name = `E2E milestone ${unique()}`;
  await signIn(page, USERS.deliveryHead);
  const base = await projectPath(page, "NW-DWH");
  await page.goto(`${base}/milestones`);
  await page.getByRole("button", { name: "Add milestone" }).click();
  await page.getByRole("dialog").getByLabel(/^Name/).fill(name);
  await page.getByRole("dialog").getByLabel(/^Due date/).fill("2027-01-15");
  await page.getByRole("dialog").getByRole("button", { name: "Save milestone" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("No baseline")).toBeVisible();

  await page.getByRole("button", { name: "Take baseline" }).click();
  await page.getByLabel("Name").fill(`Baseline ${unique()}`);
  await page.getByRole("button", { name: "Save baseline" }).click();
  await expect(row.getByText("On baseline")).toBeVisible();

  await row.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel(/^Due date/).fill("2027-01-25");
  await page.getByRole("dialog").getByRole("button", { name: "Save milestone" }).click();
  await expect(row.getByText("+10 d")).toBeVisible();
});

test("programs and status reports", async ({ page }) => {
  const code = `E2E-${unique().toUpperCase()}`.slice(0, 20);
  await signIn(page, USERS.deliveryHead);
  await page.goto("/programs/new");
  await page.getByLabel("Program code").fill(code);
  await page.getByLabel(/^Name/).fill("E2E program");
  await page.getByRole("button", { name: "Create program" }).click();
  await expect(page.getByRole("heading", { name: "E2E program" })).toBeVisible();

  const base = await projectPath(page, "NW-DWH");
  await page.goto(`${base}/reports`);
  await page.getByRole("button", { name: "New status report" }).click();
  await page.getByLabel(/^Summary/).fill(`Migration on track ${code}.`);
  await page.getByLabel("Decisions needed").fill("None this week.");
  await page.getByRole("button", { name: "Publish report" }).click();
  await expect(page.getByText("Status report published.")).toBeVisible();
  await expect(page.getByText(`Migration on track ${code}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy as Markdown" }).first()).toBeVisible();
});

test("client stakeholders see milestones but not internal work; developers see their work", async ({ page }) => {
  await signIn(page, USERS.client);
  const base = await projectPath(page, "NW-MOB");
  await page.goto(base);
  await expect(page.getByRole("link", { name: "Milestones" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Backlog" })).toHaveCount(0);
  await page.goto(`${base}/milestones`);
  await expect(page.getByText("General availability")).toBeVisible();
  await page.goto(`${base}/backlog`);
  await expect(page.getByText("You don't have access")).toBeVisible();

  await signIn(page, USERS.developer);
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
  await expect(page.getByText("Post settlement files to ledger")).toBeVisible();
  await expect(page.getByText("Cold start under 2 seconds")).toBeVisible();
});
