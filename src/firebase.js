
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD463xUHXD3ZjC6fQZgAkfG_s9LZoBPBhw",
  authDomain: "findit-campus-ea240.firebaseapp.com",
  projectId: "findit-campus-ea240",
  storageBucket: "findit-campus-ea240.firebasestorage.app",
  messagingSenderId: "452925238959",
  appId: "1:452925238959:web:50705b40f2686f9e93ee5a",
  measurementId: "G-Q2EV6103G7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
