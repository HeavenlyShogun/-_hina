import { appId, getFirebaseConfig, getFirebaseConfigError, initialAuthToken } from '../config/appConfig';
import { DEFAULT_SCORE_NAME } from '../config/branding';
import { createScoreDocument, SCORE_SOURCE_TYPES, serializeScoreContent } from '../utils/scoreDocument';

let firebaseContextPromise;
export const SCORE_COMPILER_VERSION = 'wind-poetry-score-compiler@2';
const SCORE_LIST_LIMIT = 40;
const FIRESTORE_SCORE_SAFE_BYTES = 850 * 1024;
const FIRESTORE_SCORE_STORAGE_THRESHOLD_BYTES = 500 * 1024;
const SCORE_STORAGE_CONTENT_TYPE = 'application/json; charset=utf-8';

function createPublicScoreId(uid, id) {
  const safeUid = encodeURIComponent(String(uid || 'anonymous'));
  const safeId = encodeURIComponent(String(id || 'score'));
  return `${safeUid}_${safeId}`;
}

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
      initializeFirestore,
      persistentLocalCache,
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
      increment,
    },
    {
      getStorage,
      ref: storageRef,
      uploadString,
      getDownloadURL,
      deleteObject,
    },
  ] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ]);

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
  } catch (error) {
    db = getFirestore(app);
    console.warn('Firestore persistent cache fallback to default memory cache.', error);
  }
  const storage = getStorage(app);

  return {
    appId,
    auth,
    db,
    storage,
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
    increment,
    storageRef,
    uploadString,
    getDownloadURL,
    deleteObject,
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

  let resolvedUser = ctx.auth.currentUser ?? null;
  let authUnsubscribe = null;
  const waitForUser = new Promise((resolve) => {
    const unsubscribe = ctx.onAuthStateChanged(ctx.auth, (nextUser) => {
      resolvedUser = nextUser;
      onUserChange?.(nextUser);
      if (nextUser) {
        resolve(nextUser);
      }
    });

    authUnsubscribe = unsubscribe;
  });

  try {
    if (initialAuthToken) {
      const credential = await ctx.signInWithCustomToken(ctx.auth, initialAuthToken);
      resolvedUser = credential.user ?? resolvedUser;
    } else {
      const credential = await ctx.signInAnonymously(ctx.auth);
      resolvedUser = credential.user ?? resolvedUser;
    }

    const user = resolvedUser ?? ctx.auth.currentUser ?? await waitForUser;
    onUserChange?.(user);
  } catch (error) {
    console.warn('Firebase Auth Error', error);
    authUnsubscribe?.();
    throw error;
  }

  return { ctx, user: resolvedUser ?? ctx.auth.currentUser, unsubscribe: authUnsubscribe };
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

function publicScoreCollection(ctx) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'publicScores');
}

function publicScoreDoc(ctx, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'publicScores', id);
}

function publicScoreSummaryCollection(ctx) {
  return ctx.collection(ctx.db, 'artifacts', ctx.appId, 'publicScoreSummaries');
}

function publicScoreSummaryDoc(ctx, id) {
  return ctx.doc(ctx.db, 'artifacts', ctx.appId, 'publicScoreSummaries', id);
}

function scoreStoragePath(ctx, uid, id) {
  return `artifacts/${ctx.appId}/users/${uid}/scores/${encodeURIComponent(id)}/score.json`;
}

function normalizeLegacyRecord(record = {}) {
  const hasStructuredDocument = typeof record.rawText === 'string';
  const sourceType =
    record.sourceType
    ?? SCORE_SOURCE_TYPES.JSON;

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
    sourceType: SCORE_SOURCE_TYPES.JSON,
  });
}

function createScoreSummary(documentData = {}) {
  return {
    id: documentData.id,
    title: documentData.title,
    ownerUid: documentData.ownerUid,
    publicId: documentData.publicId,
    isPublic: documentData.isPublic,
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
    contentStorage: documentData.contentStorage ?? null,
    compilerVersion: documentData.compilerVersion ?? SCORE_COMPILER_VERSION,
    copiedCount: Number(documentData.copiedCount) || 0,
    createdAt: documentData.createdAt,
    updatedAt: documentData.updatedAt,
    sharedAt: documentData.sharedAt,
  };
}

function resolvePayloadStorageId(payload, fallbackTitle) {
  return String(
    payload?.id
    ?? payload?.meta?.id
    ?? payload?.content?.meta?.id
    ?? fallbackTitle
    ?? '',
  ).trim();
}

function buildUniqueUploadId(baseId, index = 0) {
  const safeBase = String(baseId || 'score').trim() || 'score';
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeBase}-${suffix}`;
}

function createUploadPayload(file, index) {
  const payload = file?.payload ?? {};
  const uploadId = buildUniqueUploadId(resolvePayloadStorageId(payload, file?.title), index);

  return {
    ...file,
    payload: {
      ...payload,
      id: uploadId,
      meta: payload?.meta && typeof payload.meta === 'object'
        ? {
          ...payload.meta,
          id: uploadId,
        }
        : payload?.meta,
      content: payload?.content && typeof payload.content === 'object' && !Array.isArray(payload.content)
        ? {
          ...payload.content,
          meta: payload.content.meta && typeof payload.content.meta === 'object'
            ? {
              ...payload.content.meta,
              id: uploadId,
            }
            : payload.content.meta,
        }
        : payload?.content,
    },
  };
}

async function createScoreDocumentData(ctx, uid, title, payload) {
  const resolvedId = resolvePayloadStorageId(payload, title);
  const normalized = createScoreDocument({
    ...payload,
    id: resolvedId,
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
    ownerUid: uid,
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

function createStoredContentStub(documentData, storageInfo) {
  return JSON.stringify({
    storageFormat: 'hina-cloud-score-pointer@1',
    id: documentData.id,
    title: documentData.title,
    sourceType: documentData.sourceType,
    contentStorage: storageInfo,
  });
}

async function uploadScoreRawTextToStorage(ctx, uid, documentData) {
  const path = scoreStoragePath(ctx, uid, documentData.id || documentData.title);
  const ref = ctx.storageRef(ctx.storage, path);
  await ctx.uploadString(ref, documentData.rawText ?? '', 'raw', {
    contentType: SCORE_STORAGE_CONTENT_TYPE,
    customMetadata: {
      appId: ctx.appId,
      scoreId: String(documentData.id || documentData.title),
    },
  });

  return {
    provider: 'firebase-storage',
    path,
    downloadUrl: await ctx.getDownloadURL(ref),
    contentType: SCORE_STORAGE_CONTENT_TYPE,
    byteLength: estimateJsonBytes(documentData.rawText ?? ''),
    storedAt: Date.now(),
  };
}

async function prepareStoredScoreDocument(ctx, uid, title, data) {
  const documentData = await createScoreDocumentData(ctx, uid, title, data);
  const fullDocumentBytes = estimateJsonBytes(documentData);
  const storedDocumentData = { ...documentData };

  if (fullDocumentBytes > FIRESTORE_SCORE_STORAGE_THRESHOLD_BYTES) {
    const storageInfo = await uploadScoreRawTextToStorage(ctx, uid, documentData);
    const storedContent = createStoredContentStub(documentData, storageInfo);
    storedDocumentData.rawText = storedContent;
    storedDocumentData.content = storedContent;
    storedDocumentData.contentStorage = storageInfo;
  }

  assertCloudScoreSize(storedDocumentData);

  return {
    documentData,
    storedDocumentData,
    summaryData: createScoreSummary({
      ...storedDocumentData,
      rawText: documentData.rawText,
    }),
  };
}

async function fetchStoredScoreRawText(record) {
  const downloadUrl = record?.contentStorage?.downloadUrl;
  if (!downloadUrl) {
    return record;
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to load score payload from Firebase Storage: ${response.status}`);
  }

  const rawText = await response.text();
  return {
    ...record,
    rawText,
    content: rawText,
  };
}

export function normalizeLoadedScore(record) {
  const normalized = normalizeLegacyRecord(record);

  return {
    ...normalized,
    compilerVersion: SCORE_COMPILER_VERSION,
    ownerUid: record.ownerUid,
    publicId: record.publicId,
    isPublic: Boolean(record.isPublic),
    sharedAt: record.sharedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function normalizeLoadedScoreSummary(record) {
  return {
    id: record.id,
    title: record.title ?? DEFAULT_SCORE_NAME,
    ownerUid: record.ownerUid,
    publicId: record.publicId,
    isPublic: Boolean(record.isPublic),
    sourceType: record.sourceType ?? SCORE_SOURCE_TYPES.JSON,
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
    copiedCount: Number(record.copiedCount) || 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sharedAt: record.sharedAt,
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

  const record = await fetchStoredScoreRawText({ id: snapshot.id, ...snapshot.data() });
  return normalizeLoadedScore(record);
}

export async function saveScore(ctx, uid, title, data) {
  const { storedDocumentData, summaryData } = await prepareStoredScoreDocument(ctx, uid, title, data);

  await Promise.all([
    ctx.setDoc(scoreDoc(ctx, uid, storedDocumentData.id || title), storedDocumentData),
    ctx.setDoc(scoreSummaryDoc(ctx, uid, storedDocumentData.id || title), summaryData),
  ]);

  return storedDocumentData.id || title;
}

export function subscribeToPublicScores(ctx, onData, onError) {
  const scoreListQuery = ctx.query(
    publicScoreSummaryCollection(ctx),
    ctx.orderBy('sharedAt', 'desc'),
    ctx.limit(SCORE_LIST_LIMIT),
  );

  return ctx.onSnapshot(scoreListQuery, (snapshot) => {
    const scores = snapshot.docs
      .map((snap) => normalizeLoadedScoreSummary({ id: snap.id, ...snap.data() }))
      .filter((score) => score.isPublic)
      .sort((left, right) => (right.sharedAt?.seconds || 0) - (left.sharedAt?.seconds || 0));
    onData(scores);
  }, onError);
}

export async function loadPublicScore(ctx, id) {
  const snapshot = await ctx.getDoc(publicScoreDoc(ctx, id));
  if (!snapshot.exists()) {
    return null;
  }

  const data = { id: snapshot.id, ...snapshot.data() };
  if (!data.isPublic) {
    return null;
  }

  const record = await fetchStoredScoreRawText(data);
  return normalizeLoadedScore(record);
}

export async function publishScore(ctx, uid, title, data) {
  const { documentData, storedDocumentData, summaryData } = await prepareStoredScoreDocument(ctx, uid, title, data);
  const privateId = storedDocumentData.id || title;
  const publicId = createPublicScoreId(uid, privateId);
  const sharedAt = ctx.serverTimestamp();
  const publicDocumentData = {
    ...storedDocumentData,
    id: publicId,
    publicId,
    privateScoreId: privateId,
    ownerUid: uid,
    isPublic: true,
    sharedAt,
    updatedAt: ctx.serverTimestamp(),
  };
  const publicSummaryData = createScoreSummary({
    ...summaryData,
    ...publicDocumentData,
    rawText: documentData.rawText,
    contentLength: String(documentData.rawText ?? '').length,
  });
  const privatePublicFields = {
    isPublic: true,
    publicId,
    sharedAt,
    updatedAt: ctx.serverTimestamp(),
  };

  await Promise.all([
    ctx.setDoc(scoreDoc(ctx, uid, privateId), {
      ...storedDocumentData,
      ...privatePublicFields,
    }),
    ctx.setDoc(scoreSummaryDoc(ctx, uid, privateId), {
      ...summaryData,
      ...privatePublicFields,
    }),
    ctx.setDoc(publicScoreDoc(ctx, publicId), publicDocumentData),
    ctx.setDoc(publicScoreSummaryDoc(ctx, publicId), publicSummaryData),
  ]);

  return {
    publicId,
    privateId,
  };
}

export async function copyPublicScoreToUser(ctx, uid, publicId) {
  const publicScore = await loadPublicScore(ctx, publicId);
  if (!publicScore) {
    return null;
  }

  const copyTitle = `${publicScore.title ?? DEFAULT_SCORE_NAME} (copy)`;
  const {
    ownerUid: _ownerUid,
    publicId: _publicId,
    privateScoreId: _privateScoreId,
    sharedAt: _sharedAt,
    isPublic: _isPublic,
    ...copySource
  } = publicScore;
  const copiedId = await saveScore(ctx, uid, copyTitle, {
    ...copySource,
    id: `${publicId}-copy-${Date.now()}`,
    title: copyTitle,
    isPublic: false,
  });

  await ctx.setDoc(publicScoreSummaryDoc(ctx, publicId), {
    copiedCount: ctx.increment(1),
    updatedAt: ctx.serverTimestamp(),
  }, { merge: true });

  return copiedId;
}

export async function deleteScore(ctx, uid, id) {
  const snapshot = await ctx.getDoc(scoreDoc(ctx, uid, id));
  const storagePath = snapshot.exists() ? snapshot.data()?.contentStorage?.path : null;

  await Promise.all([
    ctx.deleteDoc(scoreDoc(ctx, uid, id)),
    ctx.deleteDoc(scoreSummaryDoc(ctx, uid, id)),
    storagePath
      ? ctx.deleteObject(ctx.storageRef(ctx.storage, storagePath)).catch((error) => {
        console.warn(`Firebase Storage score cleanup failed for "${storagePath}".`, error);
      })
      : null,
  ]);
}

export function uploadScores(ctx, uid, files) {
  return Promise.all(
    files
      .map((file, index) => createUploadPayload(file, index))
      .map((file) => saveScore(ctx, uid, file.title, file.payload)),
  );
}
