import { safeRedirectPath } from './safe-redirect';

interface FinishSignInOptions {
  fragment: string;
  destination: string | null;
  clearFragment: () => void;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{
    data: { user: { id: string } | null; session: { user: { id: string } } | null };
    error: unknown;
  }>;
}

export type FinishSignInResult =
  | { ok: true; destination: string }
  | { ok: false; error: 'invalid_link' | 'verification_unavailable' | 'missing_code' };

/** The URL must lose its secrets before parsing, Auth I/O, errors or navigation. */
export async function finishSignInFromFragment(options: FinishSignInOptions): Promise<FinishSignInResult> {
  try {
    options.clearFragment();
  } catch {
    // Never start Auth if the sensitive fragment could not be removed.
    return { ok: false, error: 'verification_unavailable' };
  }
  if (!options.fragment || options.fragment.length > 32768) return { ok: false, error: 'missing_code' };
  const parameters = new URLSearchParams(options.fragment.replace(/^#/, ''));
  if (parameters.has('error') || parameters.has('error_description')) return { ok: false, error: 'invalid_link' };
  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  if (!accessToken || !refreshToken) return { ok: false, error: 'missing_code' };
  if (parameters.getAll('access_token').length !== 1 || parameters.getAll('refresh_token').length !== 1) {
    return { ok: false, error: 'invalid_link' };
  }
  try {
    const result = await options.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (result.error || !result.data.user?.id || result.data.user.id !== result.data.session?.user.id) {
      return { ok: false, error: 'invalid_link' };
    }
    // The fragment's type/recovery flags do not grant password-reset or MFA privileges.
    return { ok: true, destination: safeRedirectPath(options.destination) };
  } catch {
    return { ok: false, error: 'verification_unavailable' };
  }
}
