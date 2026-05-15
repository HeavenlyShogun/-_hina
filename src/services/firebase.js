import { appId, getFirebaseConfig, getFirebaseConfigError, initialAuthToken } from '../config/appConfig';
import { DEFAULT_SCORE_NAME } from '../config/branding';
import { createScoreDocument, SCORE_SOURCE_TYPES, serializeScoreContent } from '../utils/scoreDocument';

let firebaseContextPromise;
export const SCORE_COMPILER_VERSION = 'wind-poetry-score-compiler@2';
const SCORE_LIST_LIMIT = 40;
const FIRESTORE_SCORE_SAFE_BYTES = 850 * 1024;

async function createFirebaseContext() {
  const configError = getFirebaseConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    throw new Error('缺少 Firebase 設定，請確認 `.env` 已填入 Vite Firebase 環境變數。');
  }

  const [
    { initializeApp, getApps, getApp },
    { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken },
    {
      getFirestore,
      collection,
      onSnapshot,
      deleteDoc,
      doc,
      getDoc,
      setDoc,
      serverTimestamp,
      query,
      orderBy,
      limit,
    },
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
    query,
    orderBy,
    limit,
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
    if (initialAuthToken) {
      await ctx.signInWithCustomToken(ctx.auth, initialAuthToken);
    } else {
      await ctx.signInAnonymously(ctx.auth);
    }
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

function scoreSummaryCollection(ctx, uid) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scoreSummaries');
}

function scoreSummaryDoc(ctx, uid, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'users', uid, 'scoreSummaries', id);
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

function createScoreSummary(documentData = {}) {
  return {
    id: documentData.id,
    title: documentData.title,
    sourceType: documentData.sourceType,
    bpm: documentData.bpm,
    timeSigNum: documentData.timeSigNum,
    timeSigDen: documentData.timeSigDen,
    charResolution: documentData.charResolution,
    globalKeyOffset: documentData.globalKeyOffset,
    accidentals: documentData.accidentals ?? {},
    scaleMode: documentData.scaleMode,
    tone: documentData.tone,
    reverb: documentData.reverb,
    references: Array.isArray(documentData.references)
      ? documentData.references.slice(0, 8).map((reference) => ({
        id: reference?.id,
        label: reference?.label ?? '',
        url: reference?.url ?? '',
        type: reference?.type ?? 'link',
      }))
      : [],
    referenceNotes: documentData.referenceNotes ?? '',
    contentLength: String(documentData.rawText ?? '').length,
    compilerVersion: documentData.compilerVersion ?? SCORE_COMPILER_VERSION,
    createdAt: documentData.createdAt,
    updatedAt: documentData.updatedAt,
  };
}

async function createScoreDocumentData(ctx, uid, title, payload) {
  const normalized = createScoreDocument({
    ...payload,
    id: payload.id ?? title,
    title,
  });
  const storedRawText = normalized.rawText || (
    normalized.sourceType === SCORE_SOURCE_TYPES.JSON
      ? serializeScoreContent(normalized.content, normalized.sourceType)
      : normalized.rawText
  );

  const ref = scoreDoc(ctx, uid, normalized.id || title);
  const existingSnapshot = await ctx.getDoc(ref);
  const existingCreatedAt = existingSnapshot.exists() ? existingSnapshot.data().createdAt : null;

  return {
    ...normalized,
    rawText: storedRawText,
    content: storedRawText,
    compilerVersion: SCORE_COMPILER_VERSION,
    createdAt: existingCreatedAt ?? ctx.serverTimestamp(),
    updatedAt: ctx.serverTimestamp(),
  };
}

function estimateJsonBytes(value) {
  const text = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }

  return text.length;
}

function assertCloudScoreSize(documentData) {
  const estimatedBytes = estimateJsonBytes(documentData);
  if (estimatedBytes <= FIRESTORE_SCORE_SAFE_BYTES) {
    return;
  }

  throw new Error(
    `譜面資料約 ${Math.round(estimatedBytes / 1024)} KB，已接近 Firestore 單文件上限。請先轉成 Slim JSON，或改用 Storage/Hosting 保存檔案。`,
  );
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

export function normalizeLoadedScoreSummary(record) {
  return {
    id: record.id,
    title: record.title ?? DEFAULT_SCORE_NAME,
    sourceType: record.sourceType ?? SCORE_SOURCE_TYPES.TEXT,
    bpm: record.bpm,
    timeSigNum: record.timeSigNum,
    timeSigDen: record.timeSigDen,
    charResolution: record.charResolution,
    globalKeyOffset: record.globalKeyOffset,
    accidentals: record.accidentals ?? {},
    scaleMode: record.scaleMode,
    tone: record.tone,
    reverb: record.reverb,
    references: Array.isArray(record.references) ? record.references : [],
    referenceNotes: record.referenceNotes ?? '',
    contentLength: Number(record.contentLength) || 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function subscribeToScores(ctx, uid, onData, onError) {
  const scoreListQuery = ctx.query(
    scoreSummaryCollection(ctx, uid),
    ctx.orderBy('updatedAt', 'desc'),
    ctx.limit(SCORE_LIST_LIMIT),
  );

  return ctx.onSnapshot(scoreListQuery, (snapshot) => {
    const scores = snapshot.docs
      .map((snap) => normalizeLoadedScoreSummary({ id: snap.id, ...snap.data() }))
      .sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0));
    onData(scores);
  }, onError);
}

export async function loadScore(ctx, uid, id) {
  const snapshot = await ctx.getDoc(scoreDoc(ctx, uid, id));
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeLoadedScore({ id: snapshot.id, ...snapshot.data() });
}

export async function saveScore(ctx, uid, title, data) {
  const documentData = await createScoreDocumentData(ctx, uid, title, data);
  assertCloudScoreSize(documentData);
  const summaryData = createScoreSummary(documentData);

  await Promise.all([
    ctx.setDoc(scoreDoc(ctx, uid, documentData.id || title), documentData),
    ctx.setDoc(scoreSummaryDoc(ctx, uid, documentData.id || title), summaryData),
  ]);
}

export async function deleteScore(ctx, uid, id) {
  await Promise.all([
    ctx.deleteDoc(scoreDoc(ctx, uid, id)),
    ctx.deleteDoc(scoreSummaryDoc(ctx, uid, id)),
  ]);
}

export function uploadScores(ctx, uid, files) {
  return Promise.all(
    files.map((file) => saveScore(ctx, uid, file.title, file.payload)),
  );
}
