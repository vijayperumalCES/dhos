"use client";

import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addProjectMember, removeProjectMember } from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/result";
import { addTeamMember, removeTeamMember } from "@/lib/actions/teams";

type Target = { kind: "project"; projectId: string } | { kind: "team"; teamId: string };

export function AddMemberDialog({ target, candidates }: { target: Target; candidates: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [membershipId, setMembershipId] = useState("");
  const [role, setRole] = useState("");
  const [allocation, setAllocation] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isProject = target.kind === "project";

  function submit() {
    startTransition(async () => {
      setError(null);
      setErrors({});
      const result: ActionResult =
        target.kind === "project"
          ? await addProjectMember({ projectId: target.projectId, membershipId, projectRole: role, allocationPercent: allocation })
          : await addTeamMember({ teamId: target.teamId, membershipId, teamRole: role });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setMembershipId("");
        setRole("");
        setAllocation("");
        router.refresh();
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={candidates.length === 0}>
          <UserPlus className="size-4" /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {isProject ? "project" : "team"} member</DialogTitle>
          <DialogDescription>
            {isProject
              ? "Members can view this project even without portfolio-wide access."
              : "Team membership is organizational; it does not grant project access."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={!!errors.membershipId}>
            <FieldLabel htmlFor="member">Person</FieldLabel>
            <Select value={membershipId} onValueChange={setMembershipId}>
              <SelectTrigger id="member" className="w-full">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.membershipId && <FieldError>{errors.membershipId[0]}</FieldError>}
          </Field>
          <Field data-invalid={!!(errors.projectRole ?? errors.teamRole)}>
            <FieldLabel htmlFor="member-role">Role {isProject ? <span className="text-destructive">*</span> : "(optional)"}</FieldLabel>
            <Input id="member-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Backend Engineer" maxLength={80} />
            {(errors.projectRole ?? errors.teamRole) && <FieldError>{(errors.projectRole ?? errors.teamRole)![0]}</FieldError>}
          </Field>
          {isProject && (
            <Field data-invalid={!!errors.allocationPercent}>
              <FieldLabel htmlFor="member-allocation">Indicative allocation % (optional)</FieldLabel>
              <Input
                id="member-allocation"
                inputMode="numeric"
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
                placeholder="0–100"
              />
              {errors.allocationPercent && <FieldError>{errors.allocationPercent[0]}</FieldError>}
            </Field>
          )}
          {error && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !membershipId}>
            {pending ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberButton({ target, membershipId, name }: { target: Target; membershipId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result =
            target.kind === "project"
              ? await removeProjectMember(target.projectId, membershipId)
              : await removeTeamMember(target.teamId, membershipId);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.error);
        })
      }
    >
      <X className="size-4" />
    </Button>
  );
}
