import ar, { type Dictionary } from "./ar";

export type { Dictionary } from "./ar";

export type Locale = "ar";
export const DEFAULT_LOCALE: Locale = "ar";

const dictionaries = { ar };

/** Simple {placeholder} interpolation. */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export function dict(_locale?: Locale): Dictionary {
  return dictionaries.ar;
}

export function dirOf(_locale?: Locale): "rtl" {
  return "rtl";
}

export async function getLocale(): Promise<Locale> {
  return DEFAULT_LOCALE;
}

export async function getT(): Promise<{ t: Dictionary; locale: Locale; dir: "rtl" }> {
  return { t: dictionaries.ar, locale: DEFAULT_LOCALE, dir: "rtl" };
}

export function errorKey(code: string): keyof Dictionary["errors"] | null {
  return (code in dictionaries[DEFAULT_LOCALE].errors ? code : null) as keyof Dictionary["errors"] | null;
}
