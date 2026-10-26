import { expect, type Page } from "@playwright/test";

/** Seeded demo password (supabase/seed.sql). Local stack only. */
export const DEMO_PASSWORD = "DemoPass123";

export const USERS = {
  deliveryHead: "priya@northwind.example",
  orgAdmin: "omar@northwind.example",
  projectManager: "arjun@northwind.example",
  developer: "dev@northwind.example",
  client: "claire@contoso.example",
  otherTenant: "alex@globex.example",
} as const;

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function expectProjectCodes(page: Page, codes: string[]) {
  await page.goto("/projects?status=all");
  const cells = page.locator("tbody tr td:first-child");
  await expect(cells).toHaveCount(codes.length);
  expect((await cells.allTextContents()).sort()).toEqual([...codes].sort());
}
