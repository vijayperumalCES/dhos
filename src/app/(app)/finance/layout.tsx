import { PageHeader } from "@/components/common/page-header";
import { SectionNav } from "@/components/common/section-nav";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";

export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("finance.read")) return <AccessDenied what="financial data" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Financials"
        description={`Budgets, actuals, forecasts, variance and margin across the projects you can see, in ${ctx.settings.currencyCode}.`}
      />
      <SectionNav
        label="Finance sections"
        items={[
          { href: "/finance", label: "Portfolio", exact: true },
          ...(ctx.permissions.has("finance.manage") ? [{ href: "/finance/rates", label: "Rates" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
