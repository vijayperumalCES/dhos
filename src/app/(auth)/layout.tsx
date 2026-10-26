export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
              D
            </div>
            <div className="leading-tight">
              <p className="font-semibold">DHOS</p>
              <p className="text-xs text-muted-foreground">Delivery Head Operating System</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      <div className="hidden flex-col justify-end bg-gradient-to-br from-primary to-chart-2 p-12 text-primary-foreground lg:flex">
        <p className="max-w-md text-2xl font-semibold text-balance">
          One governed view of every project, team and commitment in your portfolio.
        </p>
        <p className="mt-3 max-w-md text-sm opacity-80">
          Phase 1: projects, teams, clients, lifecycle governance, audit trail and the Delivery Command Center.
        </p>
      </div>
    </div>
  );
}
