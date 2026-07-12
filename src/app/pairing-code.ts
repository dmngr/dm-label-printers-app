const PAIRING_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COMPACT_PAIRING_CODE_PATTERN = new RegExp(`^[${PAIRING_CODE_CHARACTERS}]{8}$`);

export const PAIRING_CODE_PATTERN = new RegExp(
  `^[${PAIRING_CODE_CHARACTERS}]{4}-[${PAIRING_CODE_CHARACTERS}]{4}$`,
);

export function normalizePairingCode(value: string | null | undefined): string {
  const compact = (value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!COMPACT_PAIRING_CODE_PATTERN.test(compact)) return '';

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function isValidPairingCode(value: string | null | undefined): boolean {
  return normalizePairingCode(value).length > 0;
}
