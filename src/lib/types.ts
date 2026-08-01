/**
 * Shared domain types for Miles Mowing Management.
 * Southwest Topeka, KS lawn business — seasonal intervals baked into forecast logic.
 */

export type LawnSize = "small" | "medium" | "large" | "xlarge";
export type ScheduleType = "recurring" | "adhoc";
export type PaymentStatus = "paid" | "owes" | "partial";
export type DogWarning = "none" | "friendly" | "caution" | "do_not_enter";
export type DueStatus = "ok" | "due_soon" | "due" | "overdue" | "skip_rain";

export interface Lawn {
  id: string;
  name: string;
  address: string;
  city: string;
  notes: string;
  /** Flat charge in cents to avoid float money bugs. */
  chargeCents: number;
  size: LawnSize;
  scheduleType: ScheduleType;
  /** Preferred recurring interval override (days); null = use seasonal default. */
  intervalDays: number | null;
  /** Manual route order (lower = earlier). */
  routeOrder: number;
  dogWarning: DogWarning;
  gateCode: string;
  /** Customer phone for "On my way" SMS (digits / + allowed). */
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MowingRecord {
  id: string;
  lawnId: string;
  mowedAt: string;
  durationMinutes: number | null;
  notes: string;
  weatherSummary: string;
  /** Amount charged for this visit (cents). */
  amountCents: number;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  category: "gas" | "blades" | "oil" | "parts" | "other";
  amountCents: number;
  note: string;
  spentAt: string;
  createdAt: string;
}

export interface AppSettings {
  ownerName: string;
  pinHash: string;
  savingsGoalCents: number;
  savingsLabel: string;
  /** Rough gas estimate per yard for Today screen (cents). */
  gasEstimatePerYardCents: number;
  baseLat: number;
  baseLon: number;
  timezone: string;
}

export interface WeatherPeriod {
  label: "night" | "morning" | "afternoon";
  startHour: number;
  endHour: number;
  precipProbability: number | null;
  precipInches: number | null;
  /** Sun/wind only for morning + afternoon. */
  sunshineMinutes: number | null;
  windMph: number | null;
  windGustMph: number | null;
  tempF: number | null;
}

export interface WeatherDay {
  date: string;
  summary: string;
  highF: number;
  lowF: number;
  periods: WeatherPeriod[];
  severeFlag: boolean;
}

export interface LawnForecast {
  lawnId: string;
  lastMowedAt: string | null;
  daysSinceMow: number | null;
  recommendedIntervalDays: number;
  nextDueDate: string;
  dueStatus: DueStatus;
  reason: string;
  rainDelayDays: number;
}

export interface TodayJob {
  lawn: Lawn;
  forecast: LawnForecast;
  estimatedMinutes: number;
  distanceHint: string;
}
