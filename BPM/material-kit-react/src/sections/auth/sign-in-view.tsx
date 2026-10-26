import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { useRouter } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';

import { login, fetchAuthProfile } from 'src/sections/bpm/api';
import { saveAuthSession, ACCESS_TOKEN_STORAGE_KEY } from 'src/sections/bpm/access-control';
import {
  startMicrosoftLogin,
  readLoginErrorFromUrl,
  consumeMicrosoftAuthRedirect,
} from 'src/sections/auth/microsoft-auth.util';

function MicrosoftIcon() {
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox="0 0 23 23"
      sx={{ width: 18, height: 18, display: 'block' }}
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </Box>
  );
}

// ----------------------------------------------------------------------

export function SignInView() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
    if (token?.trim()) {
      router.replace('/');
    }
  }, [router]);

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);

  useEffect(() => {
    const loginError = readLoginErrorFromUrl();
    if (loginError) {
      setError(loginError);
    }

    const redirect = consumeMicrosoftAuthRedirect();
    if (!redirect) return;

    setMicrosoftBusy(true);
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, redirect.accessToken);
    fetchAuthProfile()
      .then((profile) => {
        saveAuthSession(redirect.accessToken, {
          roleName: profile.roleName,
          fullAccess: profile.fullAccess,
          permissions: profile.permissions,
          email: profile.email,
          displayName: profile.displayName,
          departmentIds: profile.departmentIds ?? [],
          canUseAi: profile.canUseAi,
        });
        router.replace('/');
      })
      .catch((err: Error) => {
        setError(err.message);
        setMicrosoftBusy(false);
      });
  }, [router]);

  const handleSignIn = useCallback(async () => {
    setError('');
    setSubmitting(true);
    try {
      const data = await login(email.trim(), password);
      saveAuthSession(data.accessToken, {
        roleName: data.user.roleName,
        fullAccess: data.user.fullAccess,
        permissions: data.user.permissions,
        email: data.user.email,
        displayName: data.user.displayName,
        departmentIds: data.user.departmentIds ?? [],
        canUseAi: data.user.canUseAi,
      });
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, router]);

  const renderForm = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        flexDirection: 'column',
      }}
    >
      <Button
        fullWidth
        size="large"
        variant="outlined"
        disabled={submitting || microsoftBusy}
        onClick={() => startMicrosoftLogin()}
        startIcon={<MicrosoftIcon />}
        sx={{ mb: 2.5 }}
      >
        {microsoftBusy ? 'Signing in with Microsoft…' : 'Sign in with Microsoft 365'}
      </Button>

      <Divider sx={{ width: 1, mb: 2.5, color: 'text.secondary', fontSize: 12 }}>
        or use email and password
      </Divider>

      <Alert severity="info" sx={{ mb: 2.5, width: 1, textAlign: 'left' }}>
        Email and password sign-in will remain available until <strong>15 July 2026</strong>. If you
        experience any issues, please contact{' '}
        <Link href="mailto:it.helpdesk@neweast.co">it.helpdesk@neweast.co</Link>.
      </Alert>

      <TextField
        fullWidth
        name="email"
        label="Email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        sx={{ mb: 3 }}
        slotProps={{
          inputLabel: { shrink: true },
        }}
      />

      <Link variant="body2" color="inherit" sx={{ mb: 1.5 }}>
        Forgot password?
      </Link>

      <TextField
        fullWidth
        name="password"
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type={showPassword ? 'text' : 'password'}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                  <Iconify icon={showPassword ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 3 }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, width: 1 }}>
          {error}
        </Alert>
      )}

      <Button
        fullWidth
        size="large"
        type="button"
        color="inherit"
        variant="contained"
        disabled={submitting || microsoftBusy}
        onClick={() => void handleSignIn()}
      >
        Sign in
      </Button>
    </Box>
  );

  return (
    <>
      <Stack spacing={1.5} sx={{ alignItems: 'center', mb: 4 }}>
        <Box
          component="img"
          src="/assets/logo/red_logo_new.png"
          alt="BPM logo"
          sx={{ width: 72, height: 72, objectFit: 'contain' }}
        />
        <Typography variant="h5" sx={{ textAlign: 'center', lineHeight: 1.3 }}>
          Login To
          <br />
          BPM - S4/Hana
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', px: 1 }}>
          Sign in with your NEWEAST Microsoft 365 account, or use your BPM email and password.
        </Typography>
      </Stack>
      {renderForm}
    </>
  );
}
