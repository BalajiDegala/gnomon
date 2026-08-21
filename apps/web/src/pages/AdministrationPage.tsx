import { Stack } from '@mui/material';
import { useEffect, useMemo } from 'react';

import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useAuth } from '../lib/auth';
import { confirmDiscardChanges } from '../lib/unsaved-changes';
import { parseEnumValue, useUrlQueryState } from '../lib/url-query-state';
import { AttendanceImportsPage } from './AttendanceImportsPage';
import { PolicyAdministrationPage } from './PolicyAdministrationPage';
import { SecurityAdministrationSection } from './SecurityAdministrationSection';
import { SitePreferencesPage } from './SitePreferencesPage';

type AdministrationSection = 'site_preferences' | 'imports' | 'leave_policy' | 'security';

const administrationSections = ['site_preferences', 'imports', 'leave_policy', 'security'] as const;

function parseAdministrationSection(value: string): AdministrationSection | null {
  return parseEnumValue(value, administrationSections);
}

export function AdministrationPage() {
  const { user } = useAuth();
  const canImport = user?.permissions.includes('imports:create') ?? false;
  const canManagePolicy = user?.permissions.includes('policy:manage') ?? false;
  const canManageBalances = user?.permissions.includes('employee:update') ?? false;
  const canSeeLeavePolicy = canManagePolicy || canManageBalances;
  const canManageSecurity =
    user?.grants.some(
      (grant) => grant.roleCode === 'SYSTEM_ADMIN' && grant.scope.type === 'company',
    ) ?? false;
  const defaultSection: AdministrationSection = canManagePolicy
    ? 'site_preferences'
    : canImport
      ? 'imports'
      : canSeeLeavePolicy
        ? 'leave_policy'
        : 'security';
  const [section, setSection] = useUrlQueryState(
    'section',
    defaultSection,
    parseAdministrationSection,
  );

  useEffect(() => {
    const canSeeSection =
      (section === 'imports' && canImport) ||
      (section === 'site_preferences' && canManagePolicy) ||
      (section === 'leave_policy' && canSeeLeavePolicy) ||
      (section === 'security' && canManageSecurity);
    if (!canSeeSection) setSection(defaultSection);
  }, [canImport, canManageSecurity, canSeeLeavePolicy, defaultSection, section, setSection]);

  const tabs = useMemo<ReadonlyArray<PageTab<AdministrationSection>>>(() => {
    const availableTabs: PageTab<AdministrationSection>[] = [];
    if (canManagePolicy)
      availableTabs.push({ value: 'site_preferences', label: 'Site preferences' });
    if (canImport) availableTabs.push({ value: 'imports', label: 'Attendance imports' });
    if (canManageSecurity) availableTabs.push({ value: 'security', label: 'Access & roles' });
    if (canSeeLeavePolicy) availableTabs.push({ value: 'leave_policy', label: 'Leave & holidays' });
    return availableTabs;
  }, [canImport, canManageSecurity, canSeeLeavePolicy]);

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="WORKFORCE OPERATIONS"
        title="Administration"
        meta="Attendance evidence, access control, leave balances, and working-day policy."
      />

      {tabs.length > 1 && (
        <PageTabs
          value={section}
          tabs={tabs}
          onChange={(nextSection) => {
            if (nextSection === section || confirmDiscardChanges()) setSection(nextSection);
          }}
          ariaLabel="Administration sections"
        />
      )}

      {section === 'site_preferences' && canManagePolicy ? (
        <SitePreferencesPage />
      ) : section === 'imports' && canImport ? (
        <AttendanceImportsPage embedded />
      ) : section === 'leave_policy' && canSeeLeavePolicy ? (
        <PolicyAdministrationPage />
      ) : section === 'security' && canManageSecurity ? (
        <SecurityAdministrationSection />
      ) : null}
    </Stack>
  );
}
