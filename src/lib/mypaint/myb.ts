// MyPaint brush files (.myb, version 3): JSON with, for each setting, a base value and
// the curves mapping inputs (pressure, speed…) to changes of that value.

export type MappingPoint = [x: number, y: number];

export interface MybSetting {
  base_value: number;
  /** Input name → curve points. */
  inputs: Record<string, MappingPoint[]>;
}

export interface MybBrush {
  version: 3;
  description?: string;
  notes?: string;
  settings: Record<string, MybSetting>;
}

/** Parses a .myb file. Throws if it is not a valid version 3 brush. */
export function parseMyb(text: string): MybBrush {
  const data = JSON.parse(text) as Partial<MybBrush> & { version?: unknown };
  if (data.version !== 3) {
    throw new Error(`Unsupported brush version: ${String(data.version)}`);
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error("Brush without settings");
  }
  for (const [name, setting] of Object.entries(data.settings)) {
    if (typeof setting?.base_value !== "number") {
      throw new Error(`Setting ${name} has no base value`);
    }
    if (!setting.inputs || typeof setting.inputs !== "object") {
      throw new Error(`Setting ${name} has no inputs`);
    }
    for (const [input, points] of Object.entries(setting.inputs)) {
      const valid =
        Array.isArray(points) &&
        points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
      if (!valid) {
        throw new Error(`Invalid curve for ${name} / ${input}`);
      }
    }
  }
  return data as MybBrush;
}
