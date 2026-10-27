/* global __WIKIGAME_E2E__ */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getRedirectResult } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Public Firebase web config. The key is restricted by Firestore security rules.
const firebaseConfig = {
  apiKey: 'AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ',
  authDomain: 'wikigame-5ebec.firebaseapp.com',
  projectId: 'wikigame-5ebec',
  storageBucket: 'wikigame-5ebec.firebasestorage.app',
  messagingSenderId: '744503946542',
  appId: '1:744503946542:web:0141522130c6f1c5c29ebf',
  measurementId: 'G-3FM2F29JV8',
};

// End-to-end test builds only (WIKIGAME_E2E=1, see e2e/): a demo project on the local
// emulators, so tests never reach the real project. Vite drops this from every other build.
const app = initializeApp(__WIKIGAME_E2E__
  ? { ...firebaseConfig, projectId: 'demo-wikiwiki', authDomain: '127.0.0.1' }
  : firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
if (__WIKIGAME_E2E__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}
export const redirectResult = getRedirectResult(auth);
