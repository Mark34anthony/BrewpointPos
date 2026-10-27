import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsVwebIk58R1awvhha9SkZK2KBFyKxnRk",
  authDomain: "brewpointpos.firebaseapp.com",
  projectId: "brewpointpos",
  storageBucket: "brewpointpos.firebasestorage.app",
  messagingSenderId: "813768738683",
  appId: "1:813768738683:web:51011f9d19ab9ec9eddfde"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.warn("Could not set auth persistence:", error);
});