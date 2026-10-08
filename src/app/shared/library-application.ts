/** Application status is confirmed by the Windows agent for an exact saved
 * selection. A successful assignment save, online device or empty mirror alone
 * must never become an "applied" badge. Display only server-defined reasons.
 */

export interface LibrarySelectionBrief {
  selectionId: string; source: 'store' | 'installation'; revision: number;
  templates: { id: string; name: string; version: number }[];
}
export interface LibraryApplicationStatus {
  deviceCode: string; deviceName: string; isOnline: boolean;
  state: 'applied' | 'pending' | 'failed' | 'waiting' | 'offline' | 'unsupported';
  reasonCode: string | null; capabilityVersion: number | null;
  desired: LibrarySelectionBrief;
  lastApplied: (LibrarySelectionBrief & { appliedAtUtc: string; confirmedAtUtc: string }) | null;
  reportedAtUtc: string | null;
}
export interface LibraryRetryResult { accepted: boolean; assignmentRevision: number; previousAssignmentRevision: number; }
export interface LibraryRetryCompleted extends LibraryRetryResult { deviceCode: string; }
const reasons: Record<string, string> = {
  local_template_modified: 'Το πρότυπο έχει τροποποιηθεί τοπικά. Κρατήστε πρώτα αντίγραφο της τοπικής αλλαγής στην εφαρμογή Windows.',
  local_code_collision: 'Υπάρχει τοπικό πρότυπο με τον ίδιο κωδικό. Χρειάζεται έλεγχος στην εγκατάσταση.',
  invalid_selection: 'Η εγκατάσταση δεν αναγνώρισε τη διάταξη. Ελέγξτε το πρότυπο και την έκδοση της εφαρμογής.',
  apply_failed: 'Η εφαρμογή δεν ολοκλήρωσε την αλλαγή. Δοκιμάστε ξανά και, αν επιμένει, επικοινωνήστε με την υποστήριξη.',
};
export function applicationPresentation(item: LibraryApplicationStatus) {
  const states = {
    applied: { label: 'Εφαρμόστηκε', tone: 'success', detail: 'Επιβεβαιώθηκε από την εφαρμογή Windows.' },
    pending: { label: 'Αναμονή εκτυπώσεων', tone: 'pending', detail: 'Θα εφαρμοστεί αυτόματα μόλις ολοκληρωθούν οι εκκρεμείς εκτυπώσεις.' },
    failed: { label: 'Δεν εφαρμόστηκε', tone: 'error', detail: reasons[item.reasonCode ?? ''] ?? reasons['apply_failed'] },
    waiting: { label: 'Αναμονή επιβεβαίωσης', tone: 'pending', detail: 'Η επιλογή αποθηκεύτηκε. Αναμένεται η αναφορά της εγκατάστασης.' },
    offline: { label: 'Εκτός σύνδεσης', tone: 'muted', detail: 'Η εφαρμογή θα ελέγξει την επιλογή όταν συνδεθεί ξανά.' },
    unsupported: { label: 'Χρειάζεται ενημέρωση', tone: 'muted', detail: 'Αυτή η έκδοση της εφαρμογής δεν υποστηρίζει επιβεβαίωση. Η υποστήριξη μπορεί να την ενημερώσει.' },
  };
  const state = states[item.state] ?? states.waiting;
  const names = (selection: LibrarySelectionBrief) => selection.templates.length
    ? selection.templates.map(template => `${template.name} · v${template.version}`).join(' • ')
    : 'Κανένα ενεργό πρότυπο κοινής βιβλιοθήκης';
  // confirmedAtUtc is server-issued ISO UTC, including its timezone suffix.
  const timestamp = Date.parse(item.lastApplied?.confirmedAtUtc ?? '');
  return { ...state, desiredText: names(item.desired), appliedText: item.lastApplied ? names(item.lastApplied) : '',
    confirmedTime: Number.isFinite(timestamp) ? new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp) : '',
    canRetry: item.state === 'failed' && item.isOnline && item.capabilityVersion === 1 };
}

/** Retry advances only the saved revision; never replace an unsaved draft. */
export function retryDraftRevision(current: number, retry: LibraryRetryResult): number {
  return current === retry.previousAssignmentRevision ? retry.assignmentRevision : current;
}
