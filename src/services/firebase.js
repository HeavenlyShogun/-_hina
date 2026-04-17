import { appId, getFirebaseConfig, initialAuthToken } from '../config/appConfig';

let firebaseContextPromise;

async function createFirebaseContext() {
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) return null;

  const [
    { initializeApp, getApps, getApp },
    { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken },
    { getFirestore, collection, onSnapshot, deleteDoc, doc, setDoc, serverTimestamp },
  ] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  return {
    appId,
    auth,
    db,
    collection,
    onSnapshot,
    deleteDoc,
    doc,
    setDoc,
    serverTimestamp,
    onAuthStateChanged,
    signInAnonymously,
    signInWithCustomToken,
  };
}

export async function getFirebaseContext() {
  if (!firebaseContextPromise) {
    firebaseContextPromise = createFirebaseContext();
  }
  return firebaseContextPromise;
}

export async function connectFirebaseAuth(onUserChange) {
  const ctx = await getFirebaseContext();
  if (!ctx) return null;

  const unsubscribe = ctx.onAuthStateChanged(ctx.auth, onUserChange);

  try {
    if (initialAuthToken) await ctx.signInWithCustomToken(ctx.auth, initialAuthToken);
    else await ctx.signInAnonymously(ctx.auth);
  } catch (error) {
    console.warn('Firebase Auth Error', error);
  }

  return { ctx, unsubscribe };
}

function scoreCollection(ctx, uid) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores');
}

function scoreDoc(ctx, uid, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores', id);
}

export function subscribeToScores(ctx, uid, onData) {
  return ctx.onSnapshot(scoreCollection(ctx, uid), (snapshot) => {
    const scores = snapshot.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0));
    onData(scores);
  });
}

export function saveScore(ctx, uid, title, data) {
  return ctx.setDoc(scoreDoc(ctx, uid, title), {
    title,
    ...data,
    updatedAt: ctx.serverTimestamp(),
  });
}

export function deleteScore(ctx, uid, id) {
  return ctx.deleteDoc(scoreDoc(ctx, uid, id));
}

export function uploadScores(ctx, uid, files) {
  return Promise.all(
    files.map((file) => saveScore(ctx, uid, file.title, file.payload)),
  );
}
