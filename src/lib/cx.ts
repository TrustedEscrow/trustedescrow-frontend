export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function shortAddress(a: string | null | undefined, n = 4): string {
  if (!a) return '—';
  return a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}
