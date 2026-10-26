import { keyframes } from '@emotion/react';
import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import DialogContent from '@mui/material/DialogContent';

import { Iconify } from 'src/components/iconify';

import {
  type WordFileKind,
  fetchWordExportJob,
  startWordExportJob,
  startWordFollowUpJob,
  type WordExportStage,
  type WordExportJobStatus,
  downloadWordExportJobFile,
} from 'src/sections/bpm/api';

/* ------------------------------------------------------------------ */
/* Animations                                                          */
/* ------------------------------------------------------------------ */

const ring = keyframes`
  0% { transform: scale(0.55); opacity: 0.55; }
  100% { transform: scale(1.9); opacity: 0; }
`;
const float = keyframes`
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-7px) rotate(2deg); }
`;
const stripes = keyframes`
  from { background-position: 0 0; }
  to { background-position: 40px 0; }
`;
const shimmer = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
`;
const pop = keyframes`
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1); }
`;
const slideIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(163, 33, 66, 0.5); }
  50% { box-shadow: 0 0 0 7px rgba(163, 33, 66, 0); }
`;
const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
`;
const tipFade = keyframes`
  0% { opacity: 0; transform: translateY(6px); }
  12%, 88% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
`;

const BRAND = '#A32142';

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const DOCS: Array<{ kind: WordFileKind; title: string; short: string }> = [
  { kind: 'bpm', title: 'Business Process Document', short: 'BPM Document' },
  { kind: 'sop', title: 'Standard Operating Procedure', short: 'SOP' },
  { kind: 'summary', title: 'Summary SOP', short: 'Summary SOP' },
  { kind: 'jd', title: 'Job Descriptions', short: 'Job Descriptions' },
];

const STAGES: Record<WordFileKind, Array<{ id: WordExportStage; title: string }>> = {
  bpm: [
    { id: 'prepare', title: 'Loading the process data' },
    { id: 'analysis', title: 'Analysing the process' },
    { id: 'narratives', title: 'Writing each step' },
    { id: 'structure', title: 'Swimlane, summary and glossary' },
    { id: 'build', title: 'Building the Word file' },
  ],
  sop: [
    { id: 'sop', title: 'Writing the procedures' },
    { id: 'build', title: 'Building the SOP file' },
  ],
  summary: [
    { id: 'summary', title: 'Condensing the process' },
    { id: 'build', title: 'Building the Summary SOP file' },
  ],
  jd: [
    { id: 'jd', title: 'Finding the roles and writing each job description' },
    { id: 'build', title: 'Building the Job Descriptions file' },
  ],
};

const TIPS: Record<WordFileKind, string[]> = {
  bpm: [
    'Every step is read with its owners, systems and controls.',
    'Diagrams are checked for completeness before they are placed.',
    'Linked policies are added with their Business Rules.',
    'Page numbers are measured so the table of contents is exact.',
  ],
  sop: [
    'The SOP is written from the document you just received.',
    'Each step gets actions, controls, records and exception handling.',
    'Related policies and sub-processes are linked to their steps.',
    'Sections without data are left out instead of shown empty.',
  ],
  summary: [
    'Steps are merged into a short list of key steps.',
    'The whole process fits on one or two pages.',
    'Every step code is accounted for in the summary.',
  ],
  jd: [
    'Roles are found in the "performed by" and "verified by" fields of every step.',
    'Spelling variants of the same role are merged into one job description.',
    'Reporting lines follow the verification chain in the BPM data.',
    'Every step a role performs or verifies appears in its responsibilities.',
  ],
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Orb({ done }: { done?: boolean }) {
  return (
    <Box sx={{ position: 'relative', width: 96, height: 96, mx: 'auto' }}>
      {done
        ? null
        : [0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `2px solid ${BRAND}`,
                animation: `${ring} 2.4s ease-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
      <Box
        sx={{
          position: 'absolute',
          inset: 14,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: 'common.white',
          background: done
            ? 'linear-gradient(135deg, #1B9E5A, #34C77B)'
            : `linear-gradient(135deg, ${BRAND}, #D1456B)`,
          boxShadow: '0 8px 22px rgba(163, 33, 66, 0.35)',
          animation: done ? `${pop} 0.5s ease-out` : `${float} 3s ease-in-out infinite`,
        }}
      >
        <Iconify icon={done ? 'solar:check-circle-bold' : 'solar:document-bold'} width={34} />
      </Box>
    </Box>
  );
}

function DocStepper({ active, files }: { active: WordFileKind; files: WordFileKind[] }) {
  // Job descriptions are optional: they only join the steps once they are being made or exist.
  const docs = DOCS.filter((doc) => doc.kind !== 'jd' || active === 'jd' || files.includes('jd'));
  return (
    <Stack direction="row" alignItems="center" justifyContent="center" sx={{ width: 1 }}>
      {docs.map((doc, index) => {
        const ready = files.includes(doc.kind);
        const current = doc.kind === active && !ready;
        return (
          <Stack
            key={doc.kind}
            direction="row"
            alignItems="center"
            sx={{ flex: index < docs.length - 1 ? 1 : 'none' }}
          >
            <Stack alignItems="center" spacing={0.5} sx={{ minWidth: 64 }}>
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: ready || current ? 'common.white' : 'text.disabled',
                  bgcolor: ready ? 'success.main' : current ? BRAND : 'action.hover',
                  animation: current
                    ? `${pulse} 1.6s ease-in-out infinite`
                    : ready
                      ? `${pop} 0.4s ease-out`
                      : 'none',
                  transition: 'background-color 0.4s',
                }}
              >
                {ready ? <Iconify icon="solar:check-circle-bold" width={18} /> : index + 1}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: current ? 700 : 500,
                  color: ready || current ? 'text.primary' : 'text.disabled',
                }}
              >
                {doc.short}
              </Typography>
            </Stack>
            {index < docs.length - 1 ? (
              <Box
                sx={{
                  flex: 1,
                  height: 3,
                  mx: 0.5,
                  mb: 2.5,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: 1,
                    width: ready ? '100%' : '0%',
                    bgcolor: 'success.main',
                    transition: 'width 0.8s ease',
                  }}
                />
              </Box>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}

function AnimatedBar({ value }: { value: number }) {
  return (
    <Box
      sx={{
        position: 'relative',
        height: 14,
        borderRadius: 99,
        bgcolor: 'action.hover',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          width: `${Math.max(value, 3)}%`,
          borderRadius: 99,
          transition: 'width 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
          backgroundColor: BRAND,
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.28) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.28) 75%, transparent 75%)',
          backgroundSize: '40px 40px',
          animation: `${stripes} 1s linear infinite`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '35%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
            animation: `${shimmer} 1.8s ease-in-out infinite`,
          }}
        />
      </Box>
    </Box>
  );
}

function Dots() {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{ display: 'inline-flex', ml: 0.75, verticalAlign: 'middle' }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            bgcolor: BRAND,
            animation: `${bounce} 1.2s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </Stack>
  );
}

function Tip({ tips }: { tips: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    const id = window.setInterval(() => setIndex((value) => (value + 1) % tips.length), 4200);
    return () => window.clearInterval(id);
  }, [tips]);
  return (
    <Typography
      key={index}
      variant="caption"
      sx={{
        display: 'block',
        minHeight: 20,
        color: 'text.secondary',
        textAlign: 'center',
        animation: `${tipFade} 4.2s ease-in-out`,
      }}
    >
      {tips[index]}
    </Typography>
  );
}

function StageList({ kind, status }: { kind: WordFileKind; status: WordExportJobStatus | null }) {
  const stages = STAGES[kind];
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === status?.stage)
  );
  return (
    <Stack spacing={0.9}>
      {stages.map((stage, index) => {
        const done = currentIndex > index || status?.status === 'done';
        const current = index === currentIndex && status?.status === 'running';
        return (
          <Stack
            key={stage.id}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{ animation: `${slideIn} 0.45s ease-out ${index * 0.07}s both` }}
          >
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: 'common.white',
                bgcolor: done ? 'success.main' : current ? BRAND : 'action.hover',
                animation: current
                  ? `${pulse} 1.6s ease-in-out infinite`
                  : done
                    ? `${pop} 0.4s ease-out`
                    : 'none',
              }}
            >
              {done ? <Iconify icon="solar:check-circle-bold" width={14} /> : null}
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: done || current ? 'text.primary' : 'text.disabled',
                fontWeight: current ? 700 : 400,
                transition: 'color 0.3s',
              }}
            >
              {stage.title}
              {current ? <Dots /> : null}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

function FileLinks({
  files,
  onDownload,
}: {
  files: Array<{ kind: WordFileKind; filename: string }>;
  onDownload: (kind: WordFileKind, filename: string) => void;
}) {
  return (
    <Stack spacing={1}>
      {DOCS.filter((doc) => files.some((file) => file.kind === doc.kind)).map((doc, index) => {
        const file = files.find((item) => item.kind === doc.kind)!;
        return (
          <Stack
            key={doc.kind}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
              p: 1.25,
              borderRadius: 1.5,
              border: 1,
              borderColor: 'divider',
              animation: `${slideIn} 0.5s ease-out ${index * 0.12}s both`,
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                color: 'common.white',
                bgcolor: BRAND,
                flexShrink: 0,
              }}
            >
              <Iconify icon="solar:document-bold" width={22} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2">{doc.title}</Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{ display: 'block', color: 'text.secondary' }}
              >
                {file.filename}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onDownload(doc.kind, file.filename)}
            >
              Download
            </Button>
          </Stack>
        );
      })}
    </Stack>
  );
}

function JdOffer({ onGenerate }: { onGenerate: () => void }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderStyle: 'dashed',
        borderColor: BRAND,
        bgcolor: 'rgba(163, 33, 66, 0.04)',
        animation: `${slideIn} 0.6s ease-out 0.3s both`,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1.25,
          display: 'grid',
          placeItems: 'center',
          color: 'common.white',
          flexShrink: 0,
          background: `linear-gradient(135deg, ${BRAND}, #D1456B)`,
          animation: `${float} 3s ease-in-out infinite`,
        }}
      >
        <Iconify icon="solar:document-bold" width={22} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2">Need job descriptions?</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          One per role, written from the BPM document: purpose, reporting line, responsibilities by
          process and performance standards.
        </Typography>
      </Box>
      <Button size="small" variant="contained" onClick={onGenerate} sx={{ flexShrink: 0 }}>
        Generate
      </Button>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export type WordExportController = ReturnType<typeof useWordExportProgress>;

export function WordExportProgressDialog({ controller }: { controller: WordExportController }) {
  const {
    open,
    view,
    status,
    error,
    files,
    close,
    generateNext,
    generateJd,
    declineNext,
    download,
  } = controller;
  const phase: WordFileKind = status?.phase ?? 'bpm';
  const progress = Math.max(0, Math.min(100, status?.progress ?? 0));
  const readyKinds = files.map((file) => file.kind);
  const nextKind = status?.next ?? null;
  const nextTitle = nextKind === 'summary' ? 'Summary SOP' : 'SOP';
  const canRetry = view === 'error' && readyKinds.length > 0 && controller.retryKind !== null;

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="xs"
      disableEscapeKeyDown={view === 'running'}
      onClose={() => {
        if (view !== 'running') close();
      }}
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      <Box
        sx={{
          height: 5,
          background: `linear-gradient(90deg, ${BRAND}, #D1456B, ${BRAND})`,
          backgroundSize: '200% 100%',
        }}
      />
      <DialogContent sx={{ pt: 3.5, pb: 3 }}>
        <Stack spacing={2.75}>
          <Orb done={view === 'ask' || view === 'final'} />

          {view === 'running' || view === 'error' ? (
            <>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6">
                  {view === 'error'
                    ? 'Generation stopped'
                    : `Generating the ${DOCS.find((d) => d.kind === phase)?.title}`}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', minHeight: 22 }}>
                  {view === 'error'
                    ? 'Something interrupted this step.'
                    : status?.label || 'Starting…'}
                </Typography>
              </Box>
              <DocStepper active={phase} files={readyKinds} />
              {view === 'running' ? (
                <Box>
                  <AnimatedBar value={progress} />
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Keep this page open
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: BRAND }}>
                      {progress}%
                    </Typography>
                  </Stack>
                </Box>
              ) : null}
              <StageList kind={phase} status={view === 'error' ? null : status} />
              {view === 'running' ? <Tip tips={TIPS[phase]} /> : null}
              {status?.note && view === 'running' ? (
                <Alert severity="info" sx={{ whiteSpace: 'pre-line' }}>
                  {status.note}
                </Alert>
              ) : null}
              {error ? <Alert severity="error">{error}</Alert> : null}
              {view === 'error' && readyKinds.length ? (
                <FileLinks files={files} onDownload={download} />
              ) : null}
              {view === 'error' ? (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button onClick={close}>Close</Button>
                  {canRetry ? (
                    <Button variant="contained" onClick={generateNext}>
                      Try again
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </>
          ) : null}

          {view === 'ask' ? (
            <>
              <DocStepper active={nextKind ?? phase} files={readyKinds} />
              <Box sx={{ textAlign: 'center', animation: `${slideIn} 0.5s ease-out` }}>
                <Typography variant="h6">
                  {phase === 'bpm' ? 'Your Word file was downloaded' : 'Your SOP was downloaded'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary' }}>
                  {nextKind === 'sop'
                    ? 'Would you like to generate the SOP now? It is written from the document you just received, so nothing is read again.'
                    : 'Would you like a Summary SOP too? It condenses the whole process into a one or two page quick reference.'}
                </Typography>
              </Box>
              {status?.warningMessage ? (
                <Alert severity="warning">{status.warningMessage}</Alert>
              ) : null}
              <Stack direction="row" spacing={1.25} justifyContent="center">
                <Button onClick={declineNext}>Not now</Button>
                <Button variant="contained" onClick={generateNext}>
                  Generate {nextTitle}
                </Button>
              </Stack>
            </>
          ) : null}

          {view === 'final' ? (
            <>
              <Box sx={{ textAlign: 'center', animation: `${slideIn} 0.5s ease-out` }}>
                <Typography variant="h6">
                  {files.length > 1 ? 'All your files are ready' : 'Your file is ready'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  Download any of them again below.
                </Typography>
              </Box>
              {status?.warningMessage ? (
                <Alert severity="warning">{status.warningMessage}</Alert>
              ) : null}
              <FileLinks files={files} onDownload={download} />
              {status?.canJd ? <JdOffer onGenerate={generateJd} /> : null}
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" onClick={close}>
                  Done
                </Button>
              </Stack>
            </>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

type View = 'running' | 'ask' | 'final' | 'error';

export function useWordExportProgress(onFinished?: (warning: string | null) => void) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('running');
  const [status, setStatus] = useState<WordExportJobStatus | null>(null);
  const [files, setFiles] = useState<Array<{ kind: WordFileKind; filename: string }>>([]);
  const [error, setError] = useState('');
  const [retryKind, setRetryKind] = useState<'sop' | 'summary' | 'jd' | null>(null);
  const timer = useRef<number | null>(null);
  const settled = useRef(false);
  const jobIdRef = useRef('');
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const stop = () => {
    if (timer.current != null) window.clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => () => stop(), []);

  const close = () => {
    stop();
    setOpen(false);
  };

  const fail = (message: string) => {
    settled.current = true;
    stop();
    setError(message);
    setView('error');
  };

  const download = async (kind: WordFileKind, filename: string) => {
    try {
      await downloadWordExportJobFile(jobIdRef.current, filename, kind);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The file could not be downloaded.');
    }
  };

  /** Follows one job phase until it is done, downloads the file and asks what comes next. */
  const track = async (jobId: string) => {
    settled.current = false;
    const poll = async () => {
      if (settled.current) return;
      const next = await fetchWordExportJob(jobId);
      if (settled.current) return;
      setStatus(next);
      if (next.status === 'done') {
        settled.current = true;
        stop();
        setFiles(next.files);
        try {
          await downloadWordExportJobFile(jobId, next.filename || 'BPM-Document.docx', next.phase);
        } catch (err: unknown) {
          fail(err instanceof Error ? err.message : 'The file could not be downloaded.');
          return;
        }
        if (next.phase === 'bpm') onFinishedRef.current?.(next.warningMessage);
        setView(next.next && next.phase !== 'jd' ? 'ask' : 'final');
      } else if (next.status === 'error') {
        setFiles(next.files);
        fail(next.error || 'Generation stopped.');
      }
    };
    timer.current = window.setInterval(() => {
      void poll().catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Could not follow generation progress.';
        if (/not found|cannot open|expired/i.test(message)) fail(message);
      });
    }, 1500);
    await poll();
  };

  const start = async (payload: { departmentId: string; processId?: string }) => {
    stop();
    setError('');
    setFiles([]);
    setRetryKind(null);
    setView('running');
    setStatus({
      jobId: '',
      status: 'running',
      phase: 'bpm',
      stage: 'prepare',
      label: 'Starting…',
      progress: 1,
      filename: null,
      files: [],
      next: null,
      canJd: false,
      warningMessage: null,
      note: null,
      error: null,
    });
    setOpen(true);
    try {
      const { jobId } = await startWordExportJob(payload);
      jobIdRef.current = jobId;
      await track(jobId);
    } catch (err: unknown) {
      fail(err instanceof Error ? err.message : 'Could not start generation.');
    }
  };

  /** Starts the SOP, the Summary SOP or the job descriptions from the data of the finished document. */
  const runFollowUp = async (kind: 'sop' | 'summary' | 'jd') => {
    if (!jobIdRef.current) return;
    stop();
    setRetryKind(kind);
    setError('');
    setView('running');
    setStatus({
      ...(status as WordExportJobStatus),
      status: 'running',
      phase: kind,
      stage: kind,
      label: {
        sop: 'Preparing the SOP',
        summary: 'Preparing the Summary SOP',
        jd: 'Preparing the job descriptions',
      }[kind],
      progress: 1,
      next: null,
      canJd: false,
      error: null,
    });
    try {
      await startWordFollowUpJob(jobIdRef.current, kind);
      await track(jobIdRef.current);
    } catch (err: unknown) {
      fail(err instanceof Error ? err.message : 'Could not start generation.');
    }
  };

  /** The SOP, then the Summary SOP, as offered by the dialog (or the step that stopped, to try again). */
  const generateNext = async () => {
    const kind = status?.next ?? retryKind;
    if (kind) await runFollowUp(kind);
  };

  const generateJd = () => runFollowUp('jd');

  const declineNext = () => setView('final');

  return {
    open,
    view,
    status,
    error,
    files,
    retryKind,
    start,
    close,
    generateNext,
    generateJd,
    declineNext,
    download,
  };
}
