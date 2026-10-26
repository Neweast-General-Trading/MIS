import type { ReactNode } from 'react';
import type { ActivityComment } from 'src/sections/bpm/storage';

import { keyframes } from '@emotion/react';
import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

const fadeSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const softHighlight = keyframes`
  0% {
    box-shadow: 0 0 0 0 transparent;
  }
  40% {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.18);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
`;

function splitDiscussionMessage(message: string): { prefix: string; body: string } {
  const m = message.match(/^(\[[^\]]+\]\s*)([\s\S]*)$/);
  if (m) return { prefix: m[1]!, body: m[2] ?? '' };
  return { prefix: '', body: message };
}

function mergeDiscussionMessage(prefix: string, body: string): string {
  const trimmed = body.trimEnd();
  if (!prefix) return trimmed;
  return `${prefix}${trimmed}`;
}

type Props = {
  comment: ActivityComment;
  highlight?: boolean;
  children?: ReactNode;
  /** Author-only — buttons hidden otherwise */
  canMutate?: boolean;
  mutating?: boolean;
  onUpdate?: (fullMessage: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function ActivityCommentBubble({
  comment,
  highlight = false,
  children,
  canMutate = false,
  mutating = false,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const { prefix, body } = splitDiscussionMessage(comment.message);
  const [draft, setDraft] = useState(body);

  useEffect(() => {
    if (!editing) {
      const next = splitDiscussionMessage(comment.message);
      setDraft(next.body);
    }
  }, [comment.message, editing]);

  const showActions = Boolean(canMutate && onUpdate && onDelete && !mutating);

  const handleSave = async () => {
    if (!onUpdate) return;
    const full = mergeDiscussionMessage(prefix, draft);
    if (!full.trim()) return;
    await onUpdate(full);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm('Delete this comment?')) return;
    await onDelete();
  };

  return (
    <Box
      sx={(theme) => ({
        border: '1px solid',
        borderColor: highlight ? theme.palette.primary.light : theme.palette.grey[300],
        borderRadius: 1,
        p: 1.25,
        bgcolor: highlight ? alpha(theme.palette.primary.main, 0.06) : theme.palette.grey[50],
        ...(highlight
          ? {
              animation: `${fadeSlideIn} 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards, ${softHighlight} 1.35s ease-out 0s`,
            }
          : {}),
        transition: theme.transitions.create(['border-color', 'background-color'], { duration: 360 }),
      })}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2">{comment.author}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {new Date(comment.createdAt).toLocaleString()}
          </Typography>
        </Box>
        {showActions && !editing ? (
          <Stack direction="row" spacing={0.25}>
            <Tooltip title="Edit">
              <IconButton size="small" disabled={mutating} onClick={() => setEditing(true)} aria-label="Edit comment">
                <Iconify icon="solar:pen-bold" width={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                disabled={mutating}
                onClick={() => void handleDelete()}
                aria-label="Delete comment"
              >
                <Iconify icon="solar:trash-bin-trash-bold" width={18} />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : null}
      </Stack>

      {editing ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={mutating}
          />
          {prefix ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Field tag preserved: {prefix.trim()}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={mutating} onClick={() => void handleSave()}>
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={mutating}
              onClick={() => {
                setEditing(false);
                setDraft(splitDiscussionMessage(comment.message).body);
              }}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.message}
        </Typography>
      )}
      {children}
    </Box>
  );
}
