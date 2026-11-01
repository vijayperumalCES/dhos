"use client";

import { CheckCircle2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import {
  addCostEntry,
  addMemberRate,
  addRateLine,
  addRevenueLine,
  approveBudget,
  deleteForecast,
  deleteMemberRate,
  deleteRateLine,
  deleteRevenueLine,
  discardBudget,
  recogniseRevenue,
  removeBudgetLine,
  reverseCostEntry,
  saveBudgetLine,
  saveContractValue,
  saveForecast,
  startBudget,
} from "@/lib/actions/finance";
import {
  BILLING_MODEL_LABELS,
  BILLING_MODELS,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  NON_LABOUR_CATEGORIES,
  type CostCategory,
} from "@/lib/domain/finance";
import { NONE } from "@/lib/validation/common";
import {
  budgetLineSchema,
  budgetStartSchema,
  contractValueSchema,
  costEntrySchema,
  forecastSchema,
  memberRateSchema,
  rateLineSchema,
  recogniseSchema,
  revenueLineSchema,
} from "@/lib/validation/finance";

const categoryOptions = (categories: readonly CostCategory[]): Option[] => categories.map((c) => ({ value: c, label: COST_CATEGORY_LABELS[c] }));
const addButton = (label: string) => (
  <Button size="sm" variant="outline">
    <Plus className="size-4" /> {label}
  </Button>
);

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------
export function RateLineDialog({ today, currency }: { today: string; currency: string }) {
  return (
    <FormDialog<{ roleTitle: string; costRate: string; billRate: string; effectiveFrom: string }>
      trigger={addButton("Add rate")}
      title="Add a rate card line"
      description={`Hourly rates in ${currency}. A rate applies from its date until a later line for the same role replaces it; past actuals keep the rate they were earned at. Roles match people by job title.`}
      submitLabel="Add rate"
      schema={rateLineSchema}
      defaultValues={{ roleTitle: "", costRate: "", billRate: "", effectiveFrom: today }}
      onSubmit={(v) => addRateLine(v)}
    >
      <TextField name="roleTitle" label="Role (job title)" required placeholder="e.g. Senior Engineer" />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="costRate" label="Cost per hour" required inputMode="decimal" description="What an hour costs us." />
        <TextField name="billRate" label="Bill per hour" inputMode="decimal" description="Optional; informational." />
        <TextField name="effectiveFrom" label="Effective from" type="date" required />
      </div>
    </FormDialog>
  );
}

export function MemberRateDialog({ members, today, currency }: { members: Option[]; today: string; currency: string }) {
  return (
    <FormDialog<{ membershipId: string; costRate: string; effectiveFrom: string }>
      trigger={addButton("Add personal rate")}
      title="Set a personal cost rate"
      description={`Overrides the rate card for one person, in ${currency} per hour, from the date given. Personal rates are visible only to people who manage finance.`}
      submitLabel="Add rate"
      schema={memberRateSchema}
      defaultValues={{ membershipId: "", costRate: "", effectiveFrom: today }}
      onSubmit={(v) => addMemberRate(v)}
    >
      <SelectField name="membershipId" label="Person" options={members} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="costRate" label="Cost per hour" required inputMode="decimal" />
        <TextField name="effectiveFrom" label="Effective from" type="date" required />
      </div>
    </FormDialog>
  );
}

export function RateRowActions({ kind, id, label, removable }: { kind: "card" | "member"; id: string; label: string; removable: boolean }) {
  return (
    <RowActions
      label={`Actions for ${label}`}
      items={[removable && { label: "Remove (not yet in effect)", icon: Trash2, destructive: true, run: () => (kind === "card" ? deleteRateLine(id) : deleteMemberRate(id)) }]}
    />
  );
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export function StartBudgetDialog({ projectId, revision }: { projectId: string; revision: boolean }) {
  return (
    <FormDialog<{ name: string }>
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> {revision ? "Start a revision" : "Draft a budget"}
        </Button>
      }
      title={revision ? "Start a budget revision" : "Draft a budget"}
      description={
        revision
          ? "The draft starts from the current baseline's lines. The baseline stays in force until someone other than you approves the revision."
          : "A draft becomes the baseline once someone other than the drafter approves it."
      }
      submitLabel="Start draft"
      schema={budgetStartSchema}
      defaultValues={{ name: revision ? "Revision" : "Initial budget" }}
      onSubmit={(v) => startBudget(projectId, v)}
    >
      <TextField name="name" label="Name" required />
    </FormDialog>
  );
}

type BudgetLineValues = { category: string; amount: string; note: string };

export function BudgetLineDialog({
  projectId,
  budgetId,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  budgetId: string;
  item?: BudgetLineValues;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<BudgetLineValues>
      open={open}
      onOpenChange={onOpenChange}
      trigger={item ? undefined : addButton("Add line")}
      title={item ? `Edit ${COST_CATEGORY_LABELS[item.category as CostCategory]} budget` : "Add a budget line"}
      description="One line per category. Setting a category that already has a line replaces its amount."
      submitLabel="Save line"
      schema={budgetLineSchema}
      defaultValues={item ?? { category: "labour", amount: "", note: "" }}
      onSubmit={(v) => saveBudgetLine(projectId, budgetId, v)}
    >
      {!item && <SelectField name="category" label="Category" options={categoryOptions(COST_CATEGORIES)} />}
      <TextField name="amount" label="Amount" required inputMode="decimal" />
      <TextareaField name="note" label="Note" rows={2} />
    </FormDialog>
  );
}

export function BudgetLineActions({ projectId, line }: { projectId: string; line: { id: string; budgetId: string; category: string; amount: number; note: string | null } }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${COST_CATEGORY_LABELS[line.category as CostCategory]} line`}
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          { label: "Remove", icon: Trash2, destructive: true, run: () => removeBudgetLine(projectId, line.id) },
        ]}
      />
      {editing && (
        <BudgetLineDialog
          projectId={projectId}
          budgetId={line.budgetId}
          open={editing}
          onOpenChange={setEditing}
          item={{ category: line.category, amount: String(line.amount), note: line.note ?? "" }}
        />
      )}
    </>
  );
}

export function BudgetDraftButtons({ projectId, budgetId, canApprove, hasLines }: { projectId: string; budgetId: string; canApprove: boolean; hasLines: boolean }) {
  return (
    <RowActions
      label="Draft budget actions"
      items={[
        canApprove && { label: hasLines ? "Approve as baseline" : "Approve as baseline (add a line first)", icon: CheckCircle2, run: () => approveBudget(projectId, budgetId) },
        "separator" as const,
        { label: "Discard draft", icon: Undo2, destructive: true, run: () => discardBudget(projectId, budgetId) },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Ledger and forecasts
// ---------------------------------------------------------------------------
export function CostEntryDialog({ projectId, today }: { projectId: string; today: string }) {
  return (
    <FormDialog<{ entryDate: string; category: string; amount: string; description: string; vendor: string; reference: string }>
      wide
      trigger={addButton("Record cost")}
      title="Record a cost"
      description="Actual spend that has been incurred. Entries can't be edited or deleted; a mistake is reversed, which keeps both lines on the record. Labour comes from approved timesheets, not from here."
      submitLabel="Record cost"
      schema={costEntrySchema}
      defaultValues={{ entryDate: today, category: "software", amount: "", description: "", vendor: "", reference: "" }}
      onSubmit={(v) => addCostEntry(projectId, v)}
    >
      <TextField name="description" label="Description" required />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="entryDate" label="Date incurred" type="date" required />
        <SelectField name="category" label="Category" options={categoryOptions(NON_LABOUR_CATEGORIES)} />
        <TextField name="amount" label="Amount" required inputMode="decimal" description="Negative for a credit." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="vendor" label="Vendor" />
        <TextField name="reference" label="Invoice or PO reference" />
      </div>
    </FormDialog>
  );
}

export function CostEntryActions({ projectId, entry, canManage }: { projectId: string; entry: { id: string; description: string; reversible: boolean }; canManage: boolean }) {
  const [reversing, setReversing] = useState(false);
  if (!canManage || !entry.reversible) return null;
  return (
    <>
      <RowActions label={`Actions for ${entry.description}`} items={[{ label: "Reverse…", icon: Undo2, destructive: true, onSelect: () => setReversing(true) }]} />
      {reversing && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setReversing(false)}
          title="Reverse this cost"
          description={`${entry.description}. A matching negative entry is added; the original stays on the ledger.`}
          label="Why is it reversed?"
          submitLabel="Reverse entry"
          destructive
          onSubmit={(note) => reverseCostEntry(projectId, entry.id, { note })}
        />
      )}
    </>
  );
}

type ForecastValues = { category: string; period: string; amount: string; note: string };

export function ForecastDialog({
  projectId,
  currentMonth,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  currentMonth: string;
  item?: ForecastValues;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<ForecastValues>
      open={open}
      onOpenChange={onOpenChange}
      trigger={item ? undefined : addButton("Add forecast")}
      title={item ? "Edit forecast" : "Forecast non-labour spend"}
      description="Expected spend for one month and category. Forecasts are opinions and can be revised; they never mix with recorded actuals. Months before the current one are ignored in the estimate at completion."
      submitLabel="Save forecast"
      schema={forecastSchema}
      defaultValues={item ?? { category: "software", period: currentMonth, amount: "", note: "" }}
      onSubmit={(v) => saveForecast(projectId, v)}
    >
      {!item && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="category" label="Category" options={categoryOptions(NON_LABOUR_CATEGORIES)} />
          <TextField name="period" label="Month" type="month" required />
        </div>
      )}
      <TextField name="amount" label="Amount" required inputMode="decimal" />
      <TextareaField name="note" label="Note" rows={2} />
    </FormDialog>
  );
}

export function ForecastActions({ projectId, currentMonth, forecast }: { projectId: string; currentMonth: string; forecast: { id: string; category: string; period: string; amount: number; note: string | null } }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label="Forecast actions"
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          { label: "Remove", icon: Trash2, destructive: true, run: () => deleteForecast(projectId, forecast.id) },
        ]}
      />
      {editing && (
        <ForecastDialog
          projectId={projectId}
          currentMonth={currentMonth}
          open={editing}
          onOpenChange={setEditing}
          item={{ category: forecast.category, period: forecast.period.slice(0, 7), amount: String(forecast.amount), note: forecast.note ?? "" }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contract values and revenue
// ---------------------------------------------------------------------------
export function ContractValueDialog({ clientId, contractId, title, current }: { clientId: string; contractId: string; title: string; current?: { totalValue: number; billingModel: string; notes: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`${current ? "Edit" : "Set"} value of ${title}`}>
        {current ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        {current ? "Edit value" : "Set value"}
      </Button>
      {open && (
        <FormDialog<{ totalValue: string; billingModel: string; notes: string }>
          open={open}
          onOpenChange={setOpen}
          title={`Value of ${title}`}
          description="Visible only to people who read finance and can see this client."
          submitLabel="Save value"
          schema={contractValueSchema}
          defaultValues={{ totalValue: current ? String(current.totalValue) : "", billingModel: current?.billingModel ?? "fixed_price", notes: current?.notes ?? "" }}
          onSubmit={(v) => saveContractValue(clientId, contractId, v)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="totalValue" label="Total value" required inputMode="decimal" />
            <SelectField name="billingModel" label="Billing model" options={BILLING_MODELS.map((m) => ({ value: m, label: BILLING_MODEL_LABELS[m] }))} />
          </div>
          <TextareaField name="notes" label="Notes" rows={2} />
        </FormDialog>
      )}
    </>
  );
}

export function RevenueLineDialog({ projectId, contracts, today }: { projectId: string; contracts: Option[]; today: string }) {
  return (
    <FormDialog<{ description: string; plannedDate: string; amount: string; contractId: string }>
      trigger={addButton("Plan revenue")}
      title="Plan revenue"
      description="A planned line is the revenue forecast. When the revenue is earned, recognise it: it then becomes a fact and is locked."
      submitLabel="Plan revenue"
      schema={revenueLineSchema}
      defaultValues={{ description: "", plannedDate: today, amount: "", contractId: NONE }}
      onSubmit={(v) => addRevenueLine(projectId, v)}
    >
      <TextField name="description" label="Description" required placeholder="e.g. Milestone 2 invoice" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="plannedDate" label="Planned date" type="date" required />
        <TextField name="amount" label="Amount" required inputMode="decimal" />
      </div>
      <SelectField name="contractId" label="Contract" options={[{ value: NONE, label: "Not linked" }, ...contracts]} />
    </FormDialog>
  );
}

export function RevenueActions({ projectId, line, today }: { projectId: string; line: { id: string; description: string }; today: string }) {
  const [recognising, setRecognising] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${line.description}`}
        items={[
          { label: "Recognise…", icon: CheckCircle2, onSelect: () => setRecognising(true) },
          "separator" as const,
          { label: "Remove", icon: Trash2, destructive: true, run: () => deleteRevenueLine(projectId, line.id) },
        ]}
      />
      {recognising && (
        <FormDialog<{ recognisedOn: string }>
          open
          onOpenChange={(o) => !o && setRecognising(false)}
          title="Recognise revenue"
          description={`${line.description}. Once recognised the line is a fact and can't be changed or removed.`}
          submitLabel="Recognise"
          schema={recogniseSchema}
          defaultValues={{ recognisedOn: today }}
          onSubmit={(v) => recogniseRevenue(projectId, line.id, v)}
        >
          <TextField name="recognisedOn" label="Recognised on" type="date" required />
        </FormDialog>
      )}
    </>
  );
}
