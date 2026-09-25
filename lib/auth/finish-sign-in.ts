interface FinishSignInOptions {
  fragment: string;
  clearFragment: () => void;
}

export type FinishSignInResult = {
  ok: false;
  error: 'legacy_link' | 'invalid_link' | 'verification_unavailable' | 'missing_code';
};

/**
 * Historical implicit links have no PKCE verifier tying them to this browser.
 * Only remove their secrets and reject them; never install or revoke a session.
 * Supported links exchange their code on the server at /auth/callback.
 */
export async function finishSignInFromFragment(options: FinishSignInOptions): Promise<FinishSignInResult> {
  try {
    options.clearFragment();
  } catch {
    return { ok: false, error: 'verification_unavailable' };
  }
  if (!options.fragment || options.fragment.length > 32768) return { ok: false, error: 'missing_code' };
  const parameters = new URLSearchParams(options.fragment.replace(/^#/, ''));
  if (parameters.has('error') || parameters.has('error_description')) return { ok: false, error: 'invalid_link' };
  if (parameters.has('access_token') || parameters.has('refresh_token')) {
    return { ok: false, error: 'legacy_link' };
  }
  return { ok: false, error: 'missing_code' };
}
