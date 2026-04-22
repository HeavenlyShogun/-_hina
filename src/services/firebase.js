import { appId, getFirebaseConfig, initialAuthToken } from '../config/appConfig';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import { normalizeScoreSource } from '../utils/score';

let firebaseContextPromise;
export const SCORE_COMPILER_VERSION = 'wind-poetry-score-compiler@1';

async function createFirebaseContext() {
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) return null;

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
  }

  return { ctx, unsubscribe };
}

function scoreCollection(ctx, uid) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores');
}

function scoreDoc(ctx, uid, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scores', id);
}

function toRawText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  return '';
}

function serializeCompiledEvents(content, payload) {
  const playbackConfig = {
    bpm: payload.bpm ?? DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: payload.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: payload.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: payload.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: payload.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
    tone: payload.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: payload.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
  };
  const { events } = normalizeScoreSource(content, playbackConfig);

  return events.map((event) => ({
    note: KEY_INFO_MAP[event.k]?.n || event.k,
    key: event.k,
    time: Number(event.time.toFixed(6)),
    duration: Number((event.durationSec ?? 0).toFixed(6)),
    velocity: Number((event.v ?? 0.85).toFixed(4)),
    trackId: event.trackId || 'main',
  }));
}

async function createScoreDocumentData(ctx, uid, title, payload) {
  const content = payload.content ?? payload.rawText ?? '';
  const rawText = payload.rawText ?? toRawText(content);
  const ref = scoreDoc(ctx, uid, title);
  const existingSnapshot = await ctx.getDoc(ref);
  const existingCreatedAt = existingSnapshot.exists() ? existingSnapshot.data().createdAt : null;

  return {
    title,
    content,
    rawText,
    compiledEvents: serializeCompiledEvents(content, payload),
    bpm: Number(payload.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: Number(payload.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: Number(payload.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: Number(payload.charResolution) || DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: Number(payload.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals:
      payload.accidentals && typeof payload.accidentals === 'object' && !Array.isArray(payload.accidentals)
        ? payload.accidentals
        : {},
    tone: payload.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: payload.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    compilerVersion: SCORE_COMPILER_VERSION,
    createdAt: existingCreatedAt ?? ctx.serverTimestamp(),
    updatedAt: ctx.serverTimestamp(),
  };
}

function normalizeLoadedScore(record) {
  const content = record.content ?? record.rawText ?? '';
  const needsRecompile =
    record.compilerVersion !== SCORE_COMPILER_VERSION ||
    !Array.isArray(record.compiledEvents);

  if (!needsRecompile) {
    return {
      ...record,
      rawText: record.rawText ?? toRawText(content),
      content,
    };
  }

  return {
    ...record,
    content,
    rawText: record.rawText ?? toRawText(content),
    compiledEvents: serializeCompiledEvents(content, record),
    compilerVersion: SCORE_COMPILER_VERSION,
  };
}

export function subscribeToScores(ctx, uid, onData) {
  return ctx.onSnapshot(scoreCollection(ctx, uid), (snapshot) => {
    const scores = snapshot.docs
      .map((snap) => normalizeLoadedScore({ id: snap.id, ...snap.data() }))
      .sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0));
    onData(scores);
  });
}

export async function saveScore(ctx, uid, title, data) {
  const documentData = await createScoreDocumentData(ctx, uid, title, data);
  return ctx.setDoc(scoreDoc(ctx, uid, title), documentData);
}

export function deleteScore(ctx, uid, id) {
  return ctx.deleteDoc(scoreDoc(ctx, uid, id));
}

export function uploadScores(ctx, uid, files) {
  return Promise.all(
    files.map((file) => saveScore(ctx, uid, file.title, file.payload)),
  );
}
