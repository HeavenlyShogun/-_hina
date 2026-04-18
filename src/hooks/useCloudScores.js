import { useCallback, useEffect, useRef, useState } from 'react';
import { connectFirebaseAuth, deleteScore, saveScore, subscribeToScores, uploadScores } from '../services/firebase';

export function useCloudScores() {
  const [savedScores, setSavedScores] = useState([]);
  const [user, setUser] = useState(null);
  const [firebaseCtx, setFirebaseCtx] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [isSaving, setIsSaving] = useState(false);

  const authUnsubscribeRef = useRef(null);
  const scoresUnsubscribeRef = useRef(null);
  const connectPromiseRef = useRef(null);

  const ensureCloudConnection = useCallback(async () => {
    if (firebaseCtx) return firebaseCtx;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setCloudStatus('loading');
    connectPromiseRef.current = connectFirebaseAuth(setUser)
      .then((result) => {
        if (!result?.ctx) {
          setCloudStatus('unavailable');
          return null;
        }
        authUnsubscribeRef.current?.();
        authUnsubscribeRef.current = result.unsubscribe;
        setFirebaseCtx(result.ctx);
        setCloudStatus('ready');
        return result.ctx;
      })
      .catch((error) => {
        console.error(error);
        setCloudStatus('error');
        return null;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    return connectPromiseRef.current;
  }, [firebaseCtx]);

  useEffect(() => {
    if (!firebaseCtx || !user) return undefined;
    scoresUnsubscribeRef.current?.();
    const unsubscribe = subscribeToScores(firebaseCtx, user.uid, setSavedScores);
    scoresUnsubscribeRef.current = unsubscribe;
    return () => unsubscribe();
  }, [firebaseCtx, user]);

  useEffect(() => () => {
    authUnsubscribeRef.current?.();
    scoresUnsubscribeRef.current?.();
  }, []);

  const saveCloudScore = useCallback(async (title, payload) => {
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return false;

    setIsSaving(true);
    try {
      await saveScore(ctx, user.uid, title, payload);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [ensureCloudConnection, user]);

  const deleteCloudScore = useCallback(async (id) => {
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return false;
    await deleteScore(ctx, user.uid, id);
    return true;
  }, [ensureCloudConnection, user]);

  const clearAllCloudScores = useCallback(async () => {
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return false;
    await Promise.all(savedScores.map((saved) => deleteScore(ctx, user.uid, saved.id)));
    return true;
  }, [ensureCloudConnection, savedScores, user]);

  const uploadCloudScores = useCallback(async (files) => {
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return false;
    await uploadScores(ctx, user.uid, files);
    return true;
  }, [ensureCloudConnection, user]);

  return {
    savedScores,
    user,
    cloudStatus,
    isSaving,
    ensureCloudConnection,
    saveCloudScore,
    deleteCloudScore,
    clearAllCloudScores,
    uploadCloudScores,
  };
}
