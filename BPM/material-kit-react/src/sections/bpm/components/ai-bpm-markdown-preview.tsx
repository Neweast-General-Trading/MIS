import { useId, useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';

import { Iconify } from 'src/components/iconify';

type Section = { title: string; body: string };

function splitMarkdownSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentTitle = 'Overview';
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) {
      sections.push({ title: currentTitle, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      currentTitle = h2[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    return [{ title: 'Document', body: markdown.trim() }];
  }
  return sections;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Box component="strong" key={i} sx={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Box>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        const { svg: rendered } = await mermaid.render(`bpm-mmd-${id}`, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setSvg('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <Alert severity="warning" sx={{ my: 1 }}>
        Diagram preview failed. The Word file will still embed the diagram as an image when possible.
      </Alert>
    );
  }

  if (!svg) {
    return <CircularProgress size={28} sx={{ my: 2 }} />;
  }

  return (
    <Box
      sx={{
        my: 2,
        p: 2,
        borderRadius: 1,
        bgcolor: 'background.paper',
        border: (theme) => `1px solid ${theme.vars.palette.divider}`,
        overflow: 'auto',
        '& svg': { maxWidth: '100%', height: 'auto' },
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function MarkdownBlock({ body }: { body: string }) {
  const blocks = body.split(/\n```/);

  return (
    <Box sx={{ '& > * + *': { mt: 1.5 } }}>
      {blocks.map((block, index) => {
        if (index === 0) {
          return (
            <Box key={index} component="div" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {block.split('\n').map((line, li) => {
                if (line.startsWith('### ')) {
                  return (
                    <Typography key={li} variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
                      {line.slice(4)}
                    </Typography>
                  );
                }
                if (line.startsWith('|')) {
                  return (
                    <Box
                      key={li}
                      component="code"
                      sx={{
                        display: 'block',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        overflowX: 'auto',
                      }}
                    >
                      {line}
                    </Box>
                  );
                }
                if (line.startsWith('- ')) {
                  return (
                    <Typography key={li} component="li" variant="body2" sx={{ ml: 2 }}>
                      {renderInline(line.slice(2))}
                    </Typography>
                  );
                }
                if (!line.trim()) {
                  return <Box key={li} sx={{ height: 8 }} />;
                }
                return (
                  <Typography key={li} variant="body2">
                    {renderInline(line)}
                  </Typography>
                );
              })}
            </Box>
          );
        }
        const fenceEnd = block.indexOf('\n');
        const lang = fenceEnd > 0 ? block.slice(0, fenceEnd).trim().toLowerCase() : '';
        const code = fenceEnd > 0 ? block.slice(fenceEnd + 1) : block;
        if (lang === 'mermaid') {
          return <MermaidDiagram key={index} code={code} />;
        }
        return (
          <Box
            key={index}
            component="pre"
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: 'grey.900',
              color: 'common.white',
              overflow: 'auto',
              fontSize: 13,
              m: 0,
            }}
          >
            {lang ? (
              <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 1 }}>
                {lang}
              </Typography>
            ) : null}
            {code.trimEnd()}
          </Box>
        );
      })}
    </Box>
  );
}

type Props = {
  markdown: string;
};

export function AiBpmMarkdownPreview({ markdown }: Props) {
  const sections = useMemo(() => splitMarkdownSections(markdown), [markdown]);

  if (sections.length <= 1) {
    return (
      <Box sx={{ p: 2, bgcolor: 'background.neutral', borderRadius: 2 }}>
        <MarkdownBlock body={markdown} />
      </Box>
    );
  }

  return (
    <Box>
      {sections.map((section, index) => (
        <Accordion
          key={`${section.title}-${index}`}
          defaultExpanded={index === 0}
          disableGutters
          sx={{
            bgcolor: 'background.neutral',
            '&:before': { display: 'none' },
            mb: 1,
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <AccordionSummary expandIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}>
            <Typography variant="subtitle1">{section.title}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <MarkdownBlock body={section.body} />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
