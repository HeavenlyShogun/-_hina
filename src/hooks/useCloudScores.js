import { useCallback, useEffect, useRef, useState } from 'react';
import { connectFirebaseAuth, deleteScore, saveScore, subscribeToScores, uploadScores } from '../services/firebase';

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
          setCloudError('Firebase config 尚未設定。');
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
        setCloudError(error?.message || 'Firebase 連線失敗，請檢查設定與網路。');
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
      if (!user) setSavedScores([]);
      return undefined;
    }

    scoresUnsubscribeRef.current?.();
    const unsubscribe = subscribeToScores(firebaseCtx, user.uid, setSavedScores, (error) => {
      console.error(error);
      setCloudStatus('error');
      setCloudError(error?.message || 'Firestore 訂閱失敗，請檢查安全規則與專案權限。');
    });
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

  const saveCloudScore = useCallback(async (title, payload) => {
    const connection = await getConnectedUser();
    if (!connection) return false;

    setIsSaving(true);
    try {
      await saveScore(connection.ctx, connection.uid, title, payload);
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 儲存失敗，請檢查安全規則。');
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
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 刪除失敗，請檢查安全規則。');
      return false;
    }
  }, [getConnectedUser]);

  const clearAllCloudScores = useCallback(async () => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    try {
      await Promise.all(savedScores.map((saved) => deleteScore(connection.ctx, connection.uid, saved.id)));
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 清空失敗，請檢查安全規則。');
      return false;
    }
  }, [getConnectedUser, savedScores]);

  const uploadCloudScores = useCallback(async (files) => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    try {
      await uploadScores(connection.ctx, connection.uid, files);
      setCloudError('');
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(error?.message || 'Firestore 上傳失敗，請檢查安全規則。');
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
  };
}
