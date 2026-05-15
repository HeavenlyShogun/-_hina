import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectFirebaseAuth,
  deleteScore,
  loadScore,
  saveScore,
  subscribeToScores,
  uploadScores,
} from '../services/firebase';

function resolvePayloadStorageId(title, payload) {
  return String(
    payload?.id
    ?? payload?.meta?.id
    ?? payload?.content?.meta?.id
    ?? title
    ?? '',
  ).trim();
}

export function useCloudScores() {
  const [savedScores, setSavedScores] = useState([]);
  const [user, setUser] = useState(null);
  const [firebaseCtx, setFirebaseCtx] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudError, setCloudError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const userRef = useRef(null);
  const firebaseCtxRef = useRef(null);
  const authUnsubscribeRef = useRef(null);
  const scoresUnsubscribeRef = useRef(null);
  const connectPromiseRef = useRef(null);
  const scoreCacheRef = useRef(new Map());

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    firebaseCtxRef.current = firebaseCtx;
  }, [firebaseCtx]);

  const ensureCloudConnection = useCallback(async () => {
    if (firebaseCtxRef.current) return firebaseCtxRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setCloudStatus('loading');
    setCloudError('');
    connectPromiseRef.current = connectFirebaseAuth(setUser)
      .then((result) => {
        if (!result?.ctx) {
          setCloudStatus('unavailable');
          setCloudError('Firebase 尚未連線，請確認環境設定。');
          return null;
        }

        authUnsubscribeRef.current?.();
        authUnsubscribeRef.current = result.unsubscribe;
        firebaseCtxRef.current = result.ctx;
        setFirebaseCtx(result.ctx);
        setCloudStatus('ready');
        return result.ctx;
      })
      .catch((error) => {
        console.error(error);
        setCloudStatus('error');
        setCloudError(error?.message || 'Firebase 連線失敗。');
        return null;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    return connectPromiseRef.current;
  }, []);

  useEffect(() => {
    if (!firebaseCtx || !user) {
      scoresUnsubscribeRef.current?.();
      if (!user) {
        setSavedScores([]);
        scoreCacheRef.current.clear();
      }
      return undefined;
    }

    scoresUnsubscribeRef.current?.();
    const unsubscribe = subscribeToScores(
      firebaseCtx,
      user.uid,
      (scores) => {
        setSavedScores(scores);
      },
      (error) => {
        console.error(error);
        setCloudStatus('error');
        setCloudError(error?.message || 'Firestore 訂閱失敗。');
      },
    );
    scoresUnsubscribeRef.current = unsubscribe;
    return () => unsubscribe();
  }, [firebaseCtx, user]);

  useEffect(() => () => {
    authUnsubscribeRef.current?.();
    scoresUnsubscribeRef.current?.();
  }, []);

  const getConnectedUser = useCallback(async () => {
    const ctx = await ensureCloudConnection();
    const currentUser = userRef.current;
    if (!ctx || !currentUser) return null;
    return { ctx, uid: currentUser.uid };
  }, [ensureCloudConnection]);

  const loadCloudScore = useCallback(async (id) => {
    const cached = scoreCacheRef.current.get(id);
    if (cached) {
      return cached;
    }

    const connection = await getConnectedUser();
    if (!connection) return null;

    try {
      const fullScore = await loadScore(connection.ctx, connection.uid, id);
      if (fullScore) {
        scoreCacheRef.current.set(id, fullScore);
      }
      setCloudError('');
      return fullScore;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 譜面讀取失敗。');
      return null;
    }
  }, [getConnectedUser]);

  const saveCloudScore = useCallback(async (title, payload) => {
    const connection = await getConnectedUser();
    if (!connection) return false;

    setIsSaving(true);
    try {
      await saveScore(connection.ctx, connection.uid, title, payload);
      scoreCacheRef.current.delete(resolvePayloadStorageId(title, payload));
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 存檔失敗。');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [getConnectedUser]);

  const deleteCloudScore = useCallback(async (id) => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    try {
      await deleteScore(connection.ctx, connection.uid, id);
      scoreCacheRef.current.delete(id);
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 刪除失敗。');
      return false;
    }
  }, [getConnectedUser]);

  const clearAllCloudScores = useCallback(async () => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    try {
      await Promise.all(savedScores.map((saved) => deleteScore(connection.ctx, connection.uid, saved.id)));
      scoreCacheRef.current.clear();
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 清空曲庫失敗。');
      return false;
    }
  }, [getConnectedUser, savedScores]);

  const uploadCloudScores = useCallback(async (files) => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    try {
      await uploadScores(connection.ctx, connection.uid, files);
      files.forEach((file) => {
        scoreCacheRef.current.delete(resolvePayloadStorageId(file.title, file.payload));
      });
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 批次上傳失敗。');
      return false;
    }
  }, [getConnectedUser]);

  return {
    savedScores,
    user,
    cloudStatus,
    cloudError,
    isSaving,
    ensureCloudConnection,
    saveCloudScore,
    deleteCloudScore,
    clearAllCloudScores,
    uploadCloudScores,
    loadCloudScore,
  };
}
