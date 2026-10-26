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

const MAILPIT = "http://127.0.0.1:55324";

/** Waits for the newest email to `to` in the local Mailpit inbox and returns the first link to Supabase Auth. */
export async function latestAuthLink(to: string, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`);
    const { messages } = (await res.json()) as { messages: { ID: string; Created: string }[] };
    const fresh = messages.find((m) => new Date(m.Created) >= since);
    if (fresh) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { HTML: string; Text: string };
      const link = (message.HTML + message.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No auth email for ${to}`);
}
