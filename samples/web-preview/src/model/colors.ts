/** A CSS color split into a `#rrggbb` color and an opacity, for the color inputs of the preview. */
export interface ColorParts {
  readonly hex: string;
  readonly alpha: number;
}

const hex2 = (value: number): string => Math.round(value).toString(16).padStart(2, "0");

/** Parses `#rrggbb`, `#rgb`, `rgb(...)`, `rgba(...)` and `transparent`. */
export function parseColor(color: string): ColorParts {
  const value = color.trim().toLowerCase();
  if (value === "transparent") return { hex: "#000000", alpha: 0 };
  let match = /^#([0-9a-f]{6})$/.exec(value);
  if (match) return { hex: `#${match[1]}`, alpha: 1 };
  match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (match) return { hex: `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`, alpha: 1 };
  match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (match) {
    return {
      hex: `#${hex2(Number(match[1]))}${hex2(Number(match[2]))}${hex2(Number(match[3]))}`,
      alpha: Number(match[4] ?? 1),
    };
  }
  return { hex: "#000000", alpha: 1 };
}

/** `#rrggbb` for an opaque color, `rgba(...)` otherwise. */
export function formatColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}
