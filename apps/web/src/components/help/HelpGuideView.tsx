import { Box, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Search } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';

import type { HelpGuide, HelpSection } from '../../content/help';
import { SoftCard } from '../soft';

/** Renders **bold** spans; everything else is plain text. */
function richText(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Box component="strong" key={index} sx={{ fontWeight: 650, color: 'var(--g-fg)' }}>
        {part.slice(2, -2)}
      </Box>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function sectionText(section: HelpSection): string {
  return [section.title, ...section.body.flat()].join(' ').toLowerCase();
}

/** One guide: a section index beside the sections, with a search box. */
export function HelpGuideView({ guide }: { guide: HelpGuide }) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return guide.sections;
    return guide.sections.filter((section) => {
      const text = sectionText(section);
      return words.every((word) => text.includes(word));
    });
  }, [guide, query]);

  const anchor = (section: HelpSection) => `help-${guide.id}-${section.id}`;

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '240px minmax(0, 1fr)' },
        alignItems: 'start',
      }}
    >
      <Stack spacing={1.5} sx={{ position: { md: 'sticky' }, top: { md: 88 } }}>
        <TextField
          size="small"
          placeholder={`Search the ${guide.title.toLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={15} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box
          component="nav"
          aria-label={`${guide.title} sections`}
          sx={{ display: { xs: 'none', md: 'grid' }, gap: 0.25 }}
        >
          {sections.map((section) => (
            <Box
              key={section.id}
              component="a"
              href={`#${anchor(section)}`}
              onClick={(event: React.MouseEvent) => {
                event.preventDefault();
                document.getElementById(anchor(section))?.scrollIntoView({ behavior: 'smooth' });
              }}
              sx={{
                px: 1.25,
                py: 0.75,
                borderRadius: '10px',
                fontSize: 13,
                color: 'var(--g-muted)',
                textDecoration: 'none',
                '&:hover': { color: 'var(--g-fg)', bgcolor: 'action.hover' },
              }}
            >
              {section.title}
            </Box>
          ))}
        </Box>
      </Stack>

      <Stack spacing={2}>
        <Typography sx={{ fontSize: 14, color: 'var(--g-muted)' }}>{guide.summary}</Typography>
        {sections.length === 0 && (
          <Typography sx={{ fontSize: 13.5, color: 'var(--g-muted)' }}>
            Nothing in this guide matches “{query}”.
          </Typography>
        )}
        {sections.map((section) => (
          <SoftCard key={section.id} id={anchor(section)} sx={{ gap: 1.25, scrollMarginTop: 88 }}>
            <Typography component="h2" sx={{ fontSize: 16.5, fontWeight: 650 }}>
              {section.title}
            </Typography>
            {section.body.map((block, index) =>
              typeof block === 'string' ? (
                <Typography key={index} sx={{ fontSize: 14, lineHeight: 1.65 }}>
                  {richText(block)}
                </Typography>
              ) : (
                <Box
                  key={index}
                  component="ul"
                  sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75, fontSize: 14, lineHeight: 1.6 }}
                >
                  {block.map((item, itemIndex) => (
                    <li key={itemIndex}>{richText(item)}</li>
                  ))}
                </Box>
              ),
            )}
          </SoftCard>
        ))}
      </Stack>
    </Box>
  );
}
