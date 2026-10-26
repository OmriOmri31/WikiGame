import { updateProfile } from 'firebase/auth';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { cleanNickname } from './nicknameRules';

export { NICKNAME_MAX, cleanNickname, nicknameFormatProblem, nicknameLength, nicknameProblem } from './nicknameRules';

const PENDING_KEY = 'wikigame.pendingNickname';

// Case-insensitive key. One document per key in /nicknames makes names unique.
export function nicknameKey(name) {
  return cleanNickname(name).toLowerCase();
}

export const NICKNAME_TAKEN = 'הכינוי הזה כבר תפוס. בחרו כינוי אחר.';

export async function nicknameAvailable(name, uid = '') {
  const snapshot = await getDoc(doc(db, 'nicknames', nicknameKey(name)));
  return !snapshot.exists() || snapshot.data()?.uid === uid;
}

export async function loadProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

// Atomically reserve the nickname and attach it to the user.
export async function claimNickname(user, name) {
  const nickname = cleanNickname(name);
  const key = nicknameKey(nickname);
  const nameRef = doc(db, 'nicknames', key);
  const userRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (tx) => {
    const taken = await tx.get(nameRef);
    if (taken.exists() && taken.data()?.uid !== user.uid) {
      const error = new Error('nickname taken');
      error.code = 'nickname/taken';
      throw error;
    }
    const current = await tx.get(userRef);
    const oldKey = current.exists() ? current.data()?.key : '';
    if (oldKey && oldKey !== key) tx.delete(doc(db, 'nicknames', oldKey));
    if (!taken.exists()) tx.set(nameRef, { uid: user.uid, name: nickname, createdAt: serverTimestamp() });
    tx.set(userRef, { nickname, key, updatedAt: serverTimestamp() });
  });
  await updateProfile(user, { displayName: nickname });
  clearPendingNickname();
  return { nickname, key };
}

export function savePendingNickname(name) {
  try { localStorage.setItem(PENDING_KEY, cleanNickname(name)); } catch {}
}

export function pendingNickname() {
  try { return localStorage.getItem(PENDING_KEY) || ''; } catch { return ''; }
}

export function clearPendingNickname() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

// Email/password accounts must confirm their address. Google accounts are already verified.
export function needsEmailVerification(user) {
  if (!user || user.emailVerified) return false;
  const providers = (user.providerData || []).map((entry) => entry.providerId);
  return providers.includes('password') && !providers.includes('google.com');
}
