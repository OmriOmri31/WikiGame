import {
  EmailAuthProvider,
  GoogleAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { providerIds } from './linking';

// Firebase asks for a fresh sign-in before deleting an account. Five minutes is its window;
// four leaves a margin.
const RECENT_LOGIN_MS = 4 * 60 * 1000;
const BATCH_LIMIT = 400;

export class AccountDeletionError extends Error {
  constructor(stage, cause) {
    super(stage);
    this.stage = stage;
    this.cause = cause;
  }
}

export function signInMethod(user) {
  const ids = providerIds(user);
  return {
    password: ids.includes('password'),
    google: ids.includes('google.com'),
  };
}

export async function needsRecentLogin(user) {
  try {
    const result = await user.getIdTokenResult();
    const authTime = Date.parse(result.authTime);
    return !authTime || Date.now() - authTime > RECENT_LOGIN_MS;
  } catch {
    return true;
  }
}

export async function reauthWithPassword(user, password) {
  const credential = EmailAuthProvider.credential(user.email || '', password);
  await reauthenticateWithCredential(user, credential);
}

export async function reauthWithGoogle(user) {
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
}

// Removes the player's scores, profile and nickname. Scores go first: if the rules refuse,
// nothing else is touched and the sign-in account stays.
export async function deletePlayerData(uid) {
  const snapshot = await getDocs(query(collection(db, 'scores'), where('uid', '==', uid)));
  const refs = snapshot.docs.map((entry) => entry.ref);
  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(start, start + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  const userRef = doc(db, 'users', uid);
  const profile = await getDoc(userRef);
  const key = profile.exists() ? profile.data()?.key : '';
  const batch = writeBatch(db);
  if (typeof key === 'string' && key) {
    const nicknameRef = doc(db, 'nicknames', key);
    const nickname = await getDoc(nicknameRef);
    if (nickname.exists() && nickname.data()?.uid === uid) batch.delete(nicknameRef);
  }
  if (profile.exists()) batch.delete(userRef);
  await batch.commit();
  return refs.length;
}

// Game data this device keeps (saved game, local scores, intro and board hints). The theme stays.
export function clearDeviceData() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = [];
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key && key.startsWith('wikigame.')) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    } catch {
      // Storage can be unavailable (private mode). Nothing to clear then.
    }
  }
}

export async function deleteAccount(user) {
  try {
    await deletePlayerData(user.uid);
  } catch (error) {
    throw new AccountDeletionError('data', error);
  }
  try {
    await deleteUser(user);
  } catch (error) {
    throw new AccountDeletionError(error?.code === 'auth/requires-recent-login' ? 'reauth' : 'auth', error);
  }
  clearDeviceData();
}
