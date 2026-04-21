import { useCallback, useEffect, useRef, useState } from 'react';
import { connectFirebaseAuth, deleteScore, saveScore, subscribeToScores, uploadScores } from '../services/firebase';

export function useCloudScores() {
  const [savedScores, setSavedScores] = useState([]);
  const [user, setUser] = useState(null);
  const [firebaseCtx, setFirebaseCtx] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('idle');
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
    connectPromiseRef.current = connectFirebaseAuth(setUser)
      .then((result) => {
        if (!result?.ctx) {
          setCloudStatus('unavailable');
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
    const unsubscribe = subscribeToScores(firebaseCtx, user.uid, setSavedScores);
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
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [getConnectedUser]);

  const deleteCloudScore = useCallback(async (id) => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    await deleteScore(connection.ctx, connection.uid, id);
    return true;
  }, [getConnectedUser]);

  const clearAllCloudScores = useCallback(async () => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    await Promise.all(savedScores.map((saved) => deleteScore(connection.ctx, connection.uid, saved.id)));
    return true;
  }, [getConnectedUser, savedScores]);

  const uploadCloudScores = useCallback(async (files) => {
    const connection = await getConnectedUser();
    if (!connection) return false;
    await uploadScores(connection.ctx, connection.uid, files);
    return true;
  }, [getConnectedUser]);

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
