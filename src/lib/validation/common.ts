import { z } from "zod";

/** Sentinel used by select inputs for "no value" (Radix Select disallows empty strings). */
export const NONE = "none";

export const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

export const optionalUuid = z
  .string()
  .transform((v) => (v === "" || v === NONE ? null : v))
  .pipe(z.uuid().nullable());

export const optionalDate = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.iso.date({ message: "Use the format YYYY-MM-DD." }).nullable());

export const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https?$/, message: "Enter a full URL starting with http:// or https://" }).nullable());

export const uuid = z.uuid();
