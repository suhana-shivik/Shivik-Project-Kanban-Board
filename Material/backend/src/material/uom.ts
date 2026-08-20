/** Recognised units of measure. Input is matched case-insensitively. */
export const UNITS_OF_MEASURE = [
  'nos',
  'pcs',
  'set',
  'pair',
  'kg',
  'g',
  'ton',
  'quintal',
  'm',
  'cm',
  'mm',
  'ft',
  'inch',
  'sqm',
  'sqft',
  'cum',
  'cft',
  'ltr',
  'ml',
  'bag',
  'box',
  'bundle',
  'roll',
  'sheet',
  'coil',
  'pkt',
  'drum',
  'can',
] as const;

const LOOKUP = new Map<string, string>(
  UNITS_OF_MEASURE.map((unit) => [unit, unit]),
);

/** Returns the canonical spelling, or null when the unit is not recognised. */
export function normalizeUom(value: string): string | null {
  return LOOKUP.get(value.trim().toLowerCase()) ?? null;
}
