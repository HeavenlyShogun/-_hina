import { appId, getFirebaseConfig, getFirebaseConfigError, initialAuthToken } from '../config/appConfig';
import { createScoreDocument, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';

let firebaseContextPromise;
export const SCORE_COMPILER_VERSION = 'wind-poetry-score-compiler@2';

async function createFirebaseContext() {
  const configError = getFirebaseConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    throw new Error('Firebase config 無法讀取，請檢查 .env 設定。');
  }

  const [
    { initializeApp, getApps, getApp },
    { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken },
    { getFirestore, collection, onSnapshot, deleteDoc, doc, getDoc, setDoc, serverTimestamp },
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
    getDoc,
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
    throw error;
  }

  return { ctx, unsubscribe };
}

function scoreCollection(ctx, uid) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores');
}

function scoreDoc(ctx, uid, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores', id);
}

function normalizeLegacyRecord(record = {}) {
  const hasStructuredDocument = typeof record.rawText === 'string';
  const sourceType =
    record.sourceType
    ?? (record.content && typeof record.content === 'object' ? SCORE_SOURCE_TYPES.JSON : SCORE_SOURCE_TYPES.TEXT);

  if (hasStructuredDocument) {
    return createScoreDocument({
      ...record,
      sourceType,
    });
  }

  return createScoreDocument({
    ...record,
    rawText:
      typeof record.content === 'string'
        ? record.content
        : JSON.stringify(record.content ?? {}, null, 2),
    sourceType,
  });
}

async function createScoreDocumentData(ctx, uid, title, payload) {
  const normalized = createScoreDocument({
    ...payload,
    id: payload.id ?? title,
    title,
  });

  const ref = scoreDoc(ctx, uid, normalized.id || title);
  const existingSnapshot = await ctx.getDoc(ref);
  const existingCreatedAt = existingSnapshot.exists() ? existingSnapshot.data().createdAt : null;

  return {
    ...normalized,
    content: normalized.rawText,
    compilerVersion: SCORE_COMPILER_VERSION,
    createdAt: existingCreatedAt ?? ctx.serverTimestamp(),
    updatedAt: ctx.serverTimestamp(),
  };
}

export function normalizeLoadedScore(record) {
  const normalized = normalizeLegacyRecord(record);

  return {
    ...normalized,
    compilerVersion: SCORE_COMPILER_VERSION,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function subscribeToScores(ctx, uid, onData, onError) {
  return ctx.onSnapshot(scoreCollection(ctx, uid), (snapshot) => {
    const scores = snapshot.docs
      .map((snap) => normalizeLoadedScore({ id: snap.id, ...snap.data() }))
      .sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0));
    onData(scores);
  }, onError);
}

export async function saveScore(ctx, uid, title, data) {
  const documentData = await createScoreDocumentData(ctx, uid, title, data);
  return ctx.setDoc(scoreDoc(ctx, uid, documentData.id || title), documentData);
}

export function deleteScore(ctx, uid, id) {
  return ctx.deleteDoc(scoreDoc(ctx, uid, id));
}

export function uploadScores(ctx, uid, files) {
  return Promise.all(
    files.map((file) => saveScore(ctx, uid, file.title, file.payload)),
  );
}
