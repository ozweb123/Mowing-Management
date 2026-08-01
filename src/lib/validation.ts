/**
 * Zod schemas — every write path validates before touching SQLite.
 * Keeps XSS payloads out of stored fields and enforces money as integer cents.
 */

import { z } from "zod";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Strip control chars that can break UI / logs
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));

export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, "PIN must be 4–8 digits.");

export const lawnSizeSchema = z.enum(["small", "medium", "large", "xlarge"]);
export const scheduleTypeSchema = z.enum(["recurring", "adhoc"]);
export const dogWarningSchema = z.enum([
  "none",
  "friendly",
  "caution",
  "do_not_enter",
]);
export const mowerSchema = z.enum(["bad_boy_54", "john_deere_60_ztrak"]);
export const paymentStatusSchema = z.enum(["paid", "owes", "partial"]);
export const expenseCategorySchema = z.enum([
  "gas",
  "blades",
  "oil",
  "parts",
  "other",
]);

export const lawnCreateSchema = z.object({
  name: safeText(80).pipe(z.string().min(1, "Yard name is required.")),
  address: safeText(160).default(""),
  city: safeText(80).default("Topeka, KS"),
  notes: safeText(1000).default(""),
  /** Dollars from the form; converted to cents in the route. */
  chargeDollars: z.coerce.number().min(0).max(9999),
  size: lawnSizeSchema.default("medium"),
  scheduleType: scheduleTypeSchema.default("recurring"),
  intervalDays: z.coerce.number().int().min(3).max(30).nullable().optional(),
  routeOrder: z.coerce.number().int().min(0).max(9999).default(100),
  dogWarning: dogWarningSchema.default("none"),
  gateCode: safeText(40).default(""),
  /** US-ish phone: digits, spaces, dashes, parens, optional leading + */
  phone: safeText(30)
    .default("")
    .refine(
      (v) => v === "" || /^[+\d][\d\s().-]{6,28}$/.test(v),
      "Phone looks invalid."
    ),
  mower: mowerSchema.default("john_deere_60_ztrak"),
  active: z.boolean().default(true),
});

export const lawnUpdateSchema = lawnCreateSchema.partial();

export const mowingCreateSchema = z.object({
  lawnId: z.string().uuid(),
  mowedAt: z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
  notes: safeText(500).default(""),
  weatherSummary: safeText(200).default(""),
  amountCents: z.coerce.number().int().min(0).max(999999).optional(),
  paymentStatus: paymentStatusSchema.default("owes"),
});

export const paymentUpdateSchema = z.object({
  paymentStatus: paymentStatusSchema,
  paidAt: z.string().datetime().nullable().optional(),
});

export const expenseCreateSchema = z.object({
  category: expenseCategorySchema,
  amountDollars: z.coerce.number().min(0).max(99999),
  note: safeText(200).default(""),
  spentAt: z.string().datetime().optional(),
});

const blockedSlotSchema = z.object({
  dow: z.coerce.number().int().min(0).max(6),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  label: safeText(60).default("Blocked"),
});

export const settingsUpdateSchema = z.object({
  ownerName: safeText(60).optional(),
  savingsGoalDollars: z.coerce.number().min(0).max(1000000).optional(),
  savingsLabel: safeText(60).optional(),
  gasEstimatePerYardDollars: z.coerce.number().min(0).max(100).optional(),
  newPin: pinSchema.optional(),
  /** Workday window for capacity math (local hours). */
  availableStartHour: z.coerce.number().int().min(5).max(12).optional(),
  availableEndHour: z.coerce.number().int().min(12).max(22).optional(),
  /** School/sports blocks — subtracted from available minutes. */
  blocked: z.array(blockedSlotSchema).max(21).optional(),
});

export const rainPushSchema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(1),
  note: safeText(200).default("Rain day — schedule pushed."),
});

export type LawnCreateInput = z.infer<typeof lawnCreateSchema>;
export type MowingCreateInput = z.infer<typeof mowingCreateSchema>;
