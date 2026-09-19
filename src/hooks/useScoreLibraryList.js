import { useEffect, useState } from 'react';
import { loadImportableScoreGroups } from '../data/importableScoreFiles.js';

function flattenGroups(groups = []) {
  return groups.flatMap((group) => group.files ?? []);
}

export function useScoreLibraryList() {
  const [state, setState] = useState({
    scores: [],
    groups: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    loadImportableScoreGroups()
      .then((groups) => {
        if (!isMounted) {
          return;
        }

        setState({
          groups,
          scores: flattenGroups(groups),
          isLoading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setState({
          groups: [],
          scores: [],
          isLoading: false,
          error,
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

export default useScoreLibraryList;
