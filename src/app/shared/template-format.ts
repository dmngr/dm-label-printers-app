/** Preview the common invariant Windows formats. Never claim to emulate every
 * .NET custom format: imported formats outside this subset retain their bytes
 * and receive a visible preview warning. Printing still uses the Windows renderer.
 */
export function previewFormat(value: string, format: string): {value: string; supported: boolean} {
  const f = format.trim();
  if (!f) return {value, supported: true};
  if (f.toLowerCase() === 'upper') return {value: value.toUpperCase(), supported: true};
  if (f.toLowerCase() === 'lower') return {value: value.toLowerCase(), supported: true};
  // Match invariant DateTime parsing for unambiguous ISO and numeric US dates.
  // Deliberately avoid the browser's locale-dependent Date.parse.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z)?)?$/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  const parts = iso ? [iso[1], iso[2], iso[3], iso[4] || '0', iso[5] || '0', iso[6] || '0']
    : us ? [us[3], us[1], us[2], us[4] || '0', us[5] || '0', us[6] || '0']
    : time ? ['2026', '10', '8', time[1], time[2], time[3] || '0'] : null;
  if (parts) {
    const [y, m, d, h, min, s] = parts.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && h < 24 && min < 60 && s < 60;
    const tokens: Record<string, string> = {yyyy: String(y).padStart(4, '0'), yy: String(y % 100).padStart(2, '0'), MM: String(m).padStart(2, '0'), M: String(m), dd: String(d).padStart(2, '0'), d: String(d), HH: String(h).padStart(2, '0'), H: String(h), mm: String(min).padStart(2, '0'), m: String(min), ss: String(s).padStart(2, '0'), s: String(s)};
    const tokenPattern = /y+|M+|d+|H+|m+|s+|[A-Za-z]+/g;
    // Single letters are .NET standard formats, not custom date tokens.
    const supported = valid && f.length > 1 && (f.match(tokenPattern) ?? []).every(token => Object.hasOwn(tokens, token)) && !/[^ /:.,-]/.test(f.replace(tokenPattern, '')) && (!time || !/[yMd]/.test(f));
    return {value: supported ? f.replace(tokenPattern, token => tokens[token]) : value, supported};
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value))) {
    const n = Number(value), standard = /^([fFnNpP])(\d{1,2})?$/.exec(f), custom = /^(0+)(?:\.(0+)(#*))?$/.exec(f);
    if (standard) {
      const digits = Number(standard[2] ?? 2);
      if (digits > 15) return {value, supported: false};
      const kind = standard[1].toLowerCase();
      const formatted = new Intl.NumberFormat('en-US', {useGrouping: kind === 'n' || kind === 'p', minimumFractionDigits: digits, maximumFractionDigits: digits}).format(n * (kind === 'p' ? 100 : 1));
      return {value: formatted + (kind === 'p' ? ' %' : ''), supported: true};
    }
    if (custom && custom[1].length <= 15 && (custom[2]?.length ?? 0) + (custom[3]?.length ?? 0) <= 15) {
      return {value: new Intl.NumberFormat('en-US', {useGrouping: false, minimumIntegerDigits: custom[1].length, minimumFractionDigits: custom[2]?.length ?? 0, maximumFractionDigits: (custom[2]?.length ?? 0) + (custom[3]?.length ?? 0)}).format(n), supported: true};
    }
  }
  return {value, supported: false};
}
