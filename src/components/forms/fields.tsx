"use client";

import { useId } from "react";
import { Controller, get, useFormContext, useFormState, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/result";

type BaseProps = { name: string; label: string; description?: string; required?: boolean; className?: string };

// useFormState subscribes explicitly; reading the formState proxy from useFormContext is
// memoised away by the React Compiler and errors would never render.
function useFieldError(name: string): string | undefined {
  const { errors } = useFormState({ name, exact: true });
  return (get(errors, name) as { message?: string } | undefined)?.message;
}

function Label({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      )}
    </FieldLabel>
  );
}

export function TextField({
  name,
  label,
  description,
  required,
  className,
  ...inputProps
}: BaseProps & Omit<React.ComponentProps<typeof Input>, "name">) {
  const id = useId();
  const { register } = useFormContext();
  const error = useFieldError(name);
  const registered = register(name);
  return (
    <Field data-invalid={!!error} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Input
        id={id}
        aria-invalid={!!error}
        aria-required={required}
        {...inputProps}
        {...registered}
        onChange={(e) => {
          void registered.onChange(e);
          inputProps.onChange?.(e);
        }}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  description,
  required,
  className,
  rows = 3,
}: BaseProps & { rows?: number }) {
  const id = useId();
  const { register } = useFormContext();
  const error = useFieldError(name);
  return (
    <Field data-invalid={!!error} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Textarea id={id} rows={rows} aria-invalid={!!error} aria-required={required} {...register(name)} />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  name,
  label,
  description,
  required,
  className,
  options,
  placeholder = "Select…",
}: BaseProps & { options: Option[]; placeholder?: string }) {
  const id = useId();
  const { control } = useFormContext();
  const error = useFieldError(name);
  return (
    <Field data-invalid={!!error} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger id={id} aria-invalid={!!error} className="w-full" onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** Copies server-side field errors onto the form; returns the top-level message. */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, result: ActionResult<unknown>): string | null {
  if (result.ok) return null;
  for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
    if (field !== "_form") form.setError(field as Path<T>, { type: "server", message: messages[0] });
  }
  return result.error;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
