import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "projetodashboard-d151e";
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
  : undefined;

if (!getApps().length) {
  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    initializeApp({
      projectId,
    });
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
