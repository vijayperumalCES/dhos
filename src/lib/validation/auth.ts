import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

// Mirrors supabase/config.toml [auth] minimum_password_length / password_requirements.
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a digit.");

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const setPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });

/** Only allow same-origin relative redirects after sign-in. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}
