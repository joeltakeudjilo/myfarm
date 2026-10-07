import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";

// The web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDuRJcqP-b86jyCzSIlSdPLxtiPBdM5TBU",
    authDomain: "suivi-bandes.firebaseapp.com",
    projectId: "suivi-bandes",
    storageBucket: "suivi-bandes.firebasestorage.app",
    messagingSenderId: "307716222307",
    appId: "1:307716222307:web:e7d5cb67eced53d29bf756"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Mode hors-ligne : les saisies restent sur le téléphone puis partent seules
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
    }),
});