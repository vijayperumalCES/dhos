# ADR-0006: shadcn/ui (Radix), React Hook Form + Zod, Recharts

**Status:** Accepted · 2026-10-26

## Context
The brief asks for accessible Radix-based components, RHF + Zod forms and Recharts.
The current shadcn CLI defaults to a Base UI style.

## Decision
- shadcn/ui with the `radix-nova` style and the `radix-ui` package (Base UI removed).
- Zod schemas in `src/lib/validation` are shared by client forms and server actions.
- React Hook Form field wrappers read errors through `useFormState` — the React Compiler (enabled)
  memoises reads of the `formState` proxy from `useFormContext`, which otherwise hides errors.
- Recharts for charts; RAG colours are reserved status colours, always paired with text labels.
- TanStack Query is deferred to Phase 2 (first client-heavy surface: boards with Realtime).

## Consequences
- One validation source of truth.
- Contributors must use the `fields.tsx` wrappers (or `useFormState`) rather than `formState` directly.
