"use client";

import { MailPlus, MoreHorizontal, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CsvFileInput, CsvTemplateButton } from "@/components/common/csv-file-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importInvitations, type InviteImportResult } from "@/lib/actions/imports";
import { inviteMember, resendInvitation, revokeInvitation, setMemberRoles, setMembershipStatus } from "@/lib/actions/organization";
import { updateMemberProfile } from "@/lib/actions/people";
import { NONE } from "@/lib/validation/common";

export type RoleOption = { key: string; name: string; description: string };

function RolePicker({ roles, value, onChange, error }: { roles: RoleOption[]; value: string[]; onChange: (v: string[]) => void; error?: string }) {
  return (
    <FieldSet data-invalid={!!error}>
      <FieldLegend variant="label">Roles</FieldLegend>
      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {roles.map((r) => {
          const id = `role-${r.key}`;
          const checked = value.includes(r.key);
          return (
            <label key={r.key} htmlFor={id} className="flex cursor-pointer gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(c) => onChange(c ? [...value, r.key] : value.filter((k) => k !== r.key))}
              />
              <span>
                <span className="block font-medium">{r.name}</span>
                <span className="block text-xs text-muted-foreground">{r.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}

export function InviteMemberCard({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(["developer"]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  return (
    <Card id="invite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="size-4" /> Invite a member
        </CardTitle>
        <CardDescription>
          We email a one-click sign-in link. The invitation is also accepted automatically if that person signs up or
          signs in with this email, so it still works if the email is delayed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setErrors({});
              const result = await inviteMember({ email, roleKeys });
              if (result.ok) {
                if (result.message?.includes("was not sent")) toast.warning(result.message);
                else toast.success(result.message);
                setEmail("");
                router.refresh();
              } else {
                setErrors(result.fieldErrors ?? { email: [result.error] });
              }
            });
          }}
        >
          <Field data-invalid={!!errors.email} className="max-w-md">
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            {errors.email && <FieldError>{errors.email[0]}</FieldError>}
          </Field>
          <RolePicker roles={roles} value={roleKeys} onChange={setRoleKeys} error={errors.roleKeys?.[0]} />
          <Button type="submit" disabled={pending}>
            {pending ? "Inviting…" : "Record invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MemberActions({
  membershipId,
  name,
  status,
  currentRoles,
  roles,
  isSelf,
  details,
  departments,
  people,
}: {
  membershipId: string;
  name: string;
  status: "active" | "suspended";
  currentRoles: string[];
  roles: RoleOption[];
  isSelf: boolean;
  details: MemberDetails;
  departments: Choice[];
  people: Choice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [value, setValue] = useState(currentRoles);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) {
        toast.success(result.message);
        after?.();
        router.refresh();
      } else {
        setError(result.error ?? "Failed");
        if (!open) toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>Edit details</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setValue(currentRoles);
              setOpen(true);
            }}
          >
            Edit roles
          </DropdownMenuItem>
          {!isSelf &&
            (status === "active" ? (
              <DropdownMenuItem variant="destructive" onSelect={() => run(() => setMembershipStatus(membershipId, "suspended"))}>
                Suspend access
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => run(() => setMembershipStatus(membershipId, "active"))}>Reactivate</DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {detailsOpen && (
        <MemberDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          membershipId={membershipId}
          name={name}
          details={details}
          departments={departments}
          people={people}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Roles for {name}</DialogTitle>
            <DialogDescription>Role changes take effect on their next page load and are recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <RolePicker roles={roles} value={value} onChange={setValue} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button disabled={pending || value.length === 0} onClick={() => run(() => setMemberRoles({ membershipId, roleKeys: value }), () => setOpen(false))}>
              {pending ? "Saving…" : "Save roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type Choice = { value: string; label: string };
export type MemberDetails = { jobTitle: string | null; departmentId: string | null; managerMembershipId: string | null };

function MemberDetailsDialog({
  open,
  onOpenChange,
  membershipId,
  name,
  details,
  departments,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string;
  name: string;
  details: MemberDetails;
  departments: Choice[];
  people: Choice[];
}) {
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState(details.jobTitle ?? "");
  const [departmentId, setDepartmentId] = useState(details.departmentId ?? NONE);
  const [managerId, setManagerId] = useState(details.managerMembershipId ?? NONE);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Details for {name}</DialogTitle>
          <DialogDescription>Job title, department and reporting line. These don&apos;t change access.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={!!errors.jobTitle}>
            <FieldLabel htmlFor="member-title">Job title</FieldLabel>
            <Input id="member-title" value={jobTitle} maxLength={120} onChange={(e) => setJobTitle(e.target.value)} />
            {errors.jobTitle && <FieldError>{errors.jobTitle[0]}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="member-department">Department</FieldLabel>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="member-department" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!errors.managerMembershipId}>
            <FieldLabel htmlFor="member-manager">Reports to</FieldLabel>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger id="member-manager" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No manager</SelectItem>
                {people
                  .filter((p) => p.value !== membershipId)
                  .map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.managerMembershipId && <FieldError>{errors.managerMembershipId[0]}</FieldError>}
          </Field>
          {error && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setErrors({});
                setError(null);
                const r = await updateMemberProfile({ membershipId, jobTitle, departmentId, managerMembershipId: managerId });
                if (r.ok) {
                  toast.success(r.message);
                  onOpenChange(false);
                  router.refresh();
                } else {
                  setErrors(r.fieldErrors ?? {});
                  setError(r.error);
                }
              })
            }
          >
            {pending ? "Saving…" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResendInvitationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await resendInvitation(id);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {pending ? "Sending…" : "Resend email"}
    </Button>
  );
}

export function RevokeInvitationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await revokeInvitation(id);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      Revoke
    </Button>
  );
}

export function BulkInviteCard() {
  const router = useRouter();
  const [results, setResults] = useState<InviteImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" /> Bulk invite from CSV
        </CardTitle>
        <CardDescription>
          Columns: <code>email</code> and optional <code>roles</code> — role keys separated by <code>;</code> (default{" "}
          <code>developer</code>). Up to 100 rows. Each person is emailed a sign-in link; hosted email services limit how
          many emails can be sent per hour, so some may need resending later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <CsvTemplateButton filename="stride-invitations-template.csv" headers={["email", "roles"]} example={["new.person@example.com", "developer;qa_engineer"]} />
          <CsvFileInput
            label={pending ? "Inviting…" : "Upload invitations"}
            disabled={pending}
            onLoad={(text) =>
              startTransition(async () => {
                setError(null);
                setResults(null);
                const r = await importInvitations(text);
                if (r.ok) {
                  setResults(r.data);
                  toast.success(r.message);
                  router.refresh();
                } else setError(r.error);
              })
            }
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {results && (
          <ul className="divide-y rounded-md border text-sm">
            {results.map((r) => (
              <li key={r.line} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  <span className="mr-2 text-xs text-muted-foreground tabular-nums">Line {r.line}</span>
                  {r.email || "—"}
                </span>
                <span className={r.status === "error" ? "text-destructive" : r.status === "invited_no_email" ? "text-health-amber" : "text-muted-foreground"}>
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
