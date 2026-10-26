"use client";

import { MailPlus, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { inviteMember, revokeInvitation, setMemberRoles, setMembershipStatus } from "@/lib/actions/organization";

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
          The invitation is recorded now and accepted automatically when that person signs in (or signs up) with this
          verified email. Stride does not send invitation emails yet — share the sign-up link yourself.
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
                toast.success(result.message);
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
}: {
  membershipId: string;
  name: string;
  status: "active" | "suspended";
  currentRoles: string[];
  roles: RoleOption[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
          <DropdownMenuItem onSelect={() => {
              setValue(currentRoles);
              setOpen(true);
            }}>Edit roles</DropdownMenuItem>
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
