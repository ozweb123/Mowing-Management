/** Mower choices Miles can assign per lawn/job. */

export type MowerCode = "bad_boy_54" | "john_deere_60_ztrak";

export const MOWER_OPTIONS: Record<MowerCode, string> = {
  bad_boy_54: 'Bad Boy 54"',
  john_deere_60_ztrak: 'John Deere 60" ZTrak',
};

export const DEFAULT_MOWER: MowerCode = "john_deere_60_ztrak";

export function mowerLabel(code: string | null | undefined): string {
  if (!code) return MOWER_OPTIONS[DEFAULT_MOWER];
  return MOWER_OPTIONS[code as MowerCode] ?? code;
}

export const MOWER_CODES = Object.keys(MOWER_OPTIONS) as MowerCode[];
