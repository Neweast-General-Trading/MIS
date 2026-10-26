import { useLocation } from 'react-router-dom';
import { varAlpha } from 'minimal-shared/utils';
import { useRef, useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

import { Iconify } from 'src/components/iconify';

import { askBpmAssistant } from 'src/sections/bpm/api';
import { hasPermission, useAccessProfile } from 'src/sections/bpm/access-control';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export function BpmAssistantPanel() {
  const accessProfile = useAccessProfile();
  const location = useLocation();
  const canAsk = hasPermission(accessProfile, 'departments');

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Try asking: “Which processes are under 001-000-000?” or “What does sub-process 001-001-001-010 cover?”',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const onSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setError('');
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: question },
    ]);
    scrollToBottom();
    setLoading(true);

    try {
      const { answer } = await askBpmAssistant({
        question,
        pagePath: location.pathname,
      });
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: answer },
      ]);
      scrollToBottom();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canAsk) {
    return null;
  }

  return (
    <>
      {!open && (
        <Tooltip title="BPM assistant">
          <Fab
            color="primary"
            aria-label="Open BPM assistant"
            onClick={() => setOpen(true)}
            sx={{
              position: 'fixed',
              right: 24,
              bottom: 24,
              zIndex: (theme) => theme.zIndex.speedDial,
              boxShadow: (theme) => theme.shadows[8],
            }}
          >
            <Iconify icon="solar:chat-round-dots-bold" width={26} />
          </Fab>
        </Tooltip>
      )}

      {open && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: { xs: 'calc(100vw - 32px)', sm: 380 },
            maxWidth: 420,
            height: 520,
            zIndex: (theme) => theme.zIndex.modal,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: (theme) =>
                `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
              bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.06),
            }}
          >
            <Box>
              <Typography variant="subtitle1">BPM Assistant</Typography>
              <Typography variant="caption" color="text.secondary">
                Quick help with codes, names, and sub-processes
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <Iconify icon="mingcute:close-line" width={18} />
            </IconButton>
          </Stack>

          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
              bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.02),
            }}
          >
            {messages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  bgcolor: (theme) =>
                    msg.role === 'user'
                      ? varAlpha(theme.vars.palette.primary.mainChannel, 0.12)
                      : varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
                  border: (theme) =>
                    `1px solid ${varAlpha(
                      theme.vars.palette.grey['500Channel'],
                      msg.role === 'user' ? 0 : 0.12,
                    )}`,
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </Typography>
              </Box>
            ))}
            {loading && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                <CircularProgress size={16} />
                <Typography variant="caption">Thinking…</Typography>
              </Stack>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Stack
            direction="row"
            spacing={1}
            sx={{
              p: 1.5,
              borderTop: (theme) =>
                `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
            }}
          >
            <TextField
              size="small"
              fullWidth
              multiline
              maxRows={3}
              placeholder="Ask about processes or sub-processes…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              disabled={loading}
            />
            <Button
              variant="contained"
              onClick={() => void onSend()}
              disabled={loading || !input.trim()}
              sx={{ minWidth: 44, px: 1.5 }}
            >
              <Iconify icon="eva:arrow-ios-upward-fill" width={20} />
            </Button>
          </Stack>
        </Paper>
      )}
    </>
  );
}
