"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createRole, deleteRole, updateRole } from "@/lib/actions/roles";

export type PermissionInfo = { key: string; category: string; description: string };
export type RoleValues = { key: string; name: string; description: string; permissions: string[] };

const EMPTY: RoleValues = { key: "", name: "", description: "", permissions: [] };

function slugKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 49);
}

export function RoleDialog({ catalogue, role }: { catalogue: PermissionInfo[]; role?: RoleValues & { id: string } }) {
  const router = useRouter();
  const editing = Boolean(role);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<RoleValues>(role ?? EMPTY);
  const [keyEdited, setKeyEdited] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const categories = [...new Set(catalogue.map((p) => p.category))];

  function toggle(key: string, on: boolean) {
    setValues((v) => ({ ...v, permissions: on ? [...v.permissions, key] : v.permissions.filter((k) => k !== key) }));
  }

  function submit() {
    startTransition(async () => {
      setErrors({});
      setError(null);
      const result = role ? await updateRole(role.id, values) : await createRole(values);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        if (!role) setValues(EMPTY);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValues(role ?? EMPTY);
          setKeyEdited(editing);
          setErrors({});
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {role ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${role.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> New role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New custom role"}</DialogTitle>
          <DialogDescription>
            Permissions take effect for everyone holding this role on their next page load. Every change is recorded in
            the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="role-name">Name</FieldLabel>
              <Input
                id="role-name"
                value={values.name}
                maxLength={80}
                onChange={(e) => {
                  const name = e.target.value;
                  setValues((v) => ({ ...v, name, key: keyEdited ? v.key : slugKey(name) }));
                }}
              />
              {errors.name && <FieldError>{errors.name[0]}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.key}>
              <FieldLabel htmlFor="role-key">Key</FieldLabel>
              <Input
                id="role-key"
                value={values.key}
                disabled={editing}
                className="font-mono"
                onChange={(e) => {
                  setKeyEdited(true);
                  setValues((v) => ({ ...v, key: e.target.value }));
                }}
              />
              {errors.key ? (
                <FieldError>{errors.key[0]}</FieldError>
              ) : (
                <p className="text-xs text-muted-foreground">{editing ? "Keys can't be changed." : "Used in imports and the API."}</p>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="role-description">Description</FieldLabel>
            <Textarea
              id="role-description"
              rows={2}
              maxLength={300}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </Field>
          <FieldSet data-invalid={!!errors.permissions}>
            <FieldLegend variant="label">Permissions</FieldLegend>
            {errors.permissions && <FieldError>{errors.permissions[0]}</FieldError>}
            <div className="space-y-4">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{cat}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {catalogue
                      .filter((p) => p.category === cat)
                      .map((p) => {
                        const id = `perm-${p.key}`;
                        return (
                          <label key={p.key} htmlFor={id} className="flex cursor-pointer gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary">
                            <Checkbox id={id} checked={values.permissions.includes(p.key)} onCheckedChange={(c) => toggle(p.key, c === true)} />
                            <span>
                              <code className="block text-xs font-medium">{p.key}</code>
                              <span className="block text-xs text-muted-foreground">{p.description}</span>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </FieldSet>
          {error && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : role ? "Save role" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRoleButton({ id, name, memberCount }: { id: string; name: string; memberCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete role “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {memberCount > 0
              ? `${memberCount} member${memberCount === 1 ? " holds" : "s hold"} this role. Remove it from them first — deletion will be refused until then.`
              : "No members hold this role. This cannot be undone, but the audit log keeps a record."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const r = await deleteRole(id);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Delete role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
