import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously as firebaseSignInAnonymously, updateProfile } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

export const signInAnonymously = async (displayName?: string) => {
  try {
    const result = await firebaseSignInAnonymously(auth);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return result.user;
  } catch (error) {
    console.error("Anonymous login failed:", error);
    throw error;
  }
};
