import { initializeApp } from 'firebase/app';
import { getAuth, getRedirectResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const redirectResult = getRedirectResult(auth);
