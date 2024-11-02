// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCKKmyF_NJsrH88s1bolUoGUhT9XowlXhQ",
    authDomain: "wikigame-5ebec.firebaseapp.com",
    projectId: "wikigame-5ebec",
    storageBucket: "wikigame-5ebec.firebasestorage.app",
    messagingSenderId: "744503946542",
    appId: "1:744503946542:web:0141522130c6f1c5c29ebf",
    measurementId: "G-3FM2F29JV8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// Initialize Firestore
const db = getFirestore(app);

export { db };