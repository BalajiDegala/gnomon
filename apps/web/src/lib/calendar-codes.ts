import type { ManagedCalendarAvailability } from '@gnomon/shared';

/**
 * Day codes shared by the personal and team calendars. Two-letter codes so no
 * state can be mistaken for another (a single "A" read as Available and Absent).
 */
export const calendarCodes: Record<
  ManagedCalendarAvailability,
  { background: string; color: string; short: string; label: string }
> = {
  present: { background: 'var(--g-pr-soft)', color: 'var(--g-pr)', short: 'PR', label: 'Present' },
  partial: { background: 'var(--g-pt-soft)', color: 'var(--g-pt)', short: 'PT', label: 'Partial' },
  absent: {
    background: 'var(--g-ab-soft)',
    color: 'var(--g-ab)',
    short: 'AB',
    label: 'Absent (LOP)',
  },
  leave: { background: 'var(--g-lv-soft)', color: 'var(--g-lv)', short: 'LV', label: 'On leave' },
  pending: {
    background: 'var(--g-pn-soft)',
    color: 'var(--g-pn)',
    short: 'PN',
    label: 'Pending approval',
  },
  no_record: {
    background: 'var(--g-nr-soft)',
    color: 'var(--g-nr)',
    short: '—',
    label: 'No record',
  },
  upcoming: { background: 'transparent', color: 'var(--g-faint)', short: '', label: 'Upcoming' },
  non_working: {
    background: 'var(--g-off-soft)',
    color: 'var(--g-off)',
    short: 'Off',
    label: 'Weekend / holiday',
  },
  not_assigned: {
    background: 'transparent',
    color: 'var(--g-faint)',
    short: '·',
    label: 'Not assigned',
  },
};

/** Codes listed in calendar legends, in reading order. */
export const legendCodes: readonly ManagedCalendarAvailability[] = [
  'present',
  'partial',
  'absent',
  'leave',
  'pending',
  'no_record',
  'non_working',
];
