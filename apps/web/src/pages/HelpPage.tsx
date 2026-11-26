import { Stack } from '@mui/material';
import { useEffect, useMemo } from 'react';

import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { HelpGuideView } from '../components/help/HelpGuideView';
import { helpGuides, type HelpGuideId } from '../content/help';
import { useVisibleHelpGuides } from '../lib/help';
import { parseEnumValue, useUrlQueryState } from '../lib/url-query-state';

const guideIds = ['employee', 'manager', 'admin'] as const;

/** Help & guides: the employee guide for everyone, plus manager and admin guides by role. */
export function HelpPage() {
  const visible = useVisibleHelpGuides();
  const [guide, setGuide] = useUrlQueryState<HelpGuideId>('guide', 'employee', (value) =>
    parseEnumValue(value, guideIds),
  );
  useEffect(() => {
    if (!visible.includes(guide)) setGuide('employee');
  }, [guide, setGuide, visible]);

  const tabs = useMemo<ReadonlyArray<PageTab<HelpGuideId>>>(
    () => visible.map((id) => ({ value: id, label: helpGuides[id].title })),
    [visible],
  );
  const current = visible.includes(guide) ? guide : 'employee';

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      <PageHeader eyebrow="HELP" title="Help & guides" meta="How Gnomon works, step by step." />
      {tabs.length > 1 && (
        <PageTabs value={current} tabs={tabs} onChange={setGuide} ariaLabel="Guides" />
      )}
      <HelpGuideView key={current} guide={helpGuides[current]} />
    </Stack>
  );
}
