/** UTC wire timestamps from older Windows agents may omit the timezone suffix. */
export function parseUtcTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const timestamp = value.trim();
  const withoutZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/i.test(timestamp);
  return Date.parse(withoutZone ? timestamp + 'Z' : timestamp);
}
