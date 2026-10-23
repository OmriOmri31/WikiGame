import { GoogleAuthProvider } from 'firebase/auth';

// A Google credential waiting to be attached to an existing email/password account.
let pending = null;

export function rememberLinkFromError(error) {
  if (error?.code !== 'auth/account-exists-with-different-credential') return null;
  const credential = GoogleAuthProvider.credentialFromError(error);
  if (!credential) return null;
  pending = { credential, email: error?.customData?.email || '' };
  return pending;
}

export function pendingLink() {
  return pending;
}

export function clearPendingLink() {
  pending = null;
}

export function providerIds(user) {
  return (user?.providerData || []).map((entry) => entry.providerId);
}
