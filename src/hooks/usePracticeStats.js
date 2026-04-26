import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeScoreSource, PPQ } from '../utils/score';
import { parseScoreContent, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';

const EMPTY_TOTALS = Object.freeze({
  perfect: 0,
  good: 0,
  miss: 0,
});
const EMPTY_NOTES_PER_MEASURE = Object.freeze({});
const EMPTY_METRICS = Object.freeze({
  totalNotes: 0,
  totalMeasures: 0,
  measureTicks: PPQ * 4,
  notesPerMeasure: EMPTY_NOTES_PER_MEASURE,
});
const EMPTY_MEASURE_COUNTS = Object.freeze({
  perfect: 0,
  good: 0,
  miss: 0,
});

function buildScoreInput(scoreDocument) {
  if (!scoreDocument) {
    return null;
  }

  if (typeof scoreDocument === 'string') {
    return scoreDocument;
  }

  if (typeof scoreDocument.rawText === 'string') {
    return parseScoreContent(
      scoreDocument.rawText,
      scoreDocument.sourceType ?? SCORE_SOURCE_TYPES.TEXT,
    );
  }

  if (scoreDocument.content && typeof scoreDocument.content === 'object') {
    return scoreDocument.content;
  }

  return null;
}

function resolveMeasureTicks(playback = {}) {
  const resolution = Math.max(Number(playback?.resolution) || PPQ, 1);
  const timeSigNum = Math.max(Number(playback?.timeSigNum) || 4, 1);
  const timeSigDen = Math.max(Number(playback?.timeSigDen) || 4, 1);
  const beatTicks = Math.max(Math.round((resolution * 4) / timeSigDen), 1);

  return Math.max(beatTicks * timeSigNum, beatTicks);
}

function createEmptyState() {
  return {
    totals: {
      perfect: 0,
      good: 0,
      miss: 0,
    },
    currentCombo: 0,
    maxCombo: 0,
    resolvedNotes: 0,
    byMeasure: {},
  };
}

function gradeToKey(grade) {
  if (grade === 'PERFECT') {
    return 'perfect';
  }

  if (grade === 'GOOD') {
    return 'good';
  }

  return 'miss';
}

export default function usePracticeStats({
  scoreDocument,
  playbackState,
  missWindowTicks = 120,
}) {
  const [stats, setStats] = useState(createEmptyState);
  const lastObservedTickRef = useRef(0);
  const scoreMetrics = useMemo(() => {
    if (!scoreDocument) {
      return EMPTY_METRICS;
    }

    try {
      const scoreInput = buildScoreInput(scoreDocument);
      if (scoreInput == null) {
        return EMPTY_METRICS;
      }

      const normalized = normalizeScoreSource(scoreInput, {
        bpm: scoreDocument.bpm,
        timeSigNum: scoreDocument.timeSigNum,
        timeSigDen: scoreDocument.timeSigDen,
        charResolution: scoreDocument.charResolution,
      });
      const measureTicks = resolveMeasureTicks(normalized.playback);
      const notesPerMeasure = {};
      let maxTick = 0;
      let totalNotes = 0;

      normalized.events.forEach((event) => {
        if (event?.isRest || !event?.k) {
          return;
        }

        const startTick = Math.max(0, Math.round(Number(event.tick ?? event.startTick) || 0));
        const durationTicks = Math.max(
          1,
          Math.round(Number(event.durationTicks ?? event.durationTick ?? event.duration) || 1),
        );
        const measureIndex = Math.floor(startTick / measureTicks);

        notesPerMeasure[measureIndex] = (notesPerMeasure[measureIndex] || 0) + 1;
        maxTick = Math.max(maxTick, startTick + durationTicks);
        totalNotes += 1;
      });

      return {
        totalNotes,
        totalMeasures: totalNotes > 0 ? Math.max(Math.ceil(maxTick / measureTicks), 1) : 0,
        measureTicks,
        notesPerMeasure,
      };
    } catch (error) {
      console.warn('usePracticeStats: failed to normalize score.', error);
      return EMPTY_METRICS;
    }
  }, [scoreDocument]);

  const resetStats = useCallback(() => {
    setStats(createEmptyState());
  }, []);

  const recordJudgement = useCallback((judgement) => {
    if (!judgement?.grade) {
      return;
    }

    const gradeKey = gradeToKey(judgement.grade);
    const measureIndex = Math.max(Math.round(Number(judgement.measureIndex) || 0), 0);

    setStats((previous) => {
      const nextCombo = gradeKey === 'miss' ? 0 : previous.currentCombo + 1;
      const previousMeasure = previous.byMeasure[measureIndex] ?? EMPTY_MEASURE_COUNTS;

      return {
        totals: {
          ...previous.totals,
          [gradeKey]: previous.totals[gradeKey] + 1,
        },
        currentCombo: nextCombo,
        maxCombo: Math.max(previous.maxCombo, nextCombo),
        resolvedNotes: previous.resolvedNotes + 1,
        byMeasure: {
          ...previous.byMeasure,
          [measureIndex]: {
            ...previousMeasure,
            [gradeKey]: previousMeasure[gradeKey] + 1,
          },
        },
      };
    });
  }, []);

  useEffect(() => {
    resetStats();
    lastObservedTickRef.current = 0;
  }, [resetStats, scoreMetrics]);

  useEffect(() => {
    const currentTick = Math.max(0, Math.round(Number(playbackState?.currentTick) || 0));
    const lastTick = lastObservedTickRef.current;
    const rewound = currentTick + missWindowTicks < lastTick;
    const restarted = playbackState?.status === 'stopped' && currentTick === 0 && lastTick > 0;

    if (rewound || restarted) {
      resetStats();
    }

    lastObservedTickRef.current = currentTick;
  }, [missWindowTicks, playbackState?.currentTick, playbackState?.status, resetStats]);

  const currentMeasureIndex = useMemo(() => {
    if (!scoreMetrics.measureTicks) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor((Number(playbackState?.currentTick) || 0) / Math.max(scoreMetrics.measureTicks, 1)),
    );
  }, [playbackState?.currentTick, scoreMetrics.measureTicks]);

  const currentMeasureStats = useMemo(() => {
    const counts = stats.byMeasure[currentMeasureIndex] ?? EMPTY_MEASURE_COUNTS;

    return {
      index: currentMeasureIndex,
      total: scoreMetrics.notesPerMeasure[currentMeasureIndex] || 0,
      perfect: counts.perfect,
      good: counts.good,
      miss: counts.miss,
      resolved: counts.perfect + counts.good + counts.miss,
    };
  }, [currentMeasureIndex, scoreMetrics.notesPerMeasure, stats.byMeasure]);

  return {
    practiceStats: {
      totals: stats.totals,
      currentCombo: stats.currentCombo,
      maxCombo: stats.maxCombo,
      resolvedNotes: stats.resolvedNotes,
      totalNotes: scoreMetrics.totalNotes,
      totalMeasures: scoreMetrics.totalMeasures,
      currentMeasure: currentMeasureStats,
    },
    recordJudgement,
    resetStats,
  };
}
