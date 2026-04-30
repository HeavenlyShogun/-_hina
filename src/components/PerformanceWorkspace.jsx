import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListMusic, MousePointerClick } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';
import playbackController from '../services/playbackController';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import { analyzeLegacyScoreText, normalizeScoreSource, PPQ } from '../utils/score';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildLegacyTimelineItems(scoreText, normalizedScore) {
  const analysis = analyzeLegacyScoreText(scoreText, normalizedScore.playback);
  const sourceLines = String(scoreText ?? '').split(/\r?\n/u);
  let visibleLineIndex = 0;

  return sourceLines.reduce((result, rawLine, rawIndex) => {
    const content = rawLine.trim();
    if (!content || content.startsWith('//')) {
      return result;
    }

    const segment = analysis.lines[visibleLineIndex];
    visibleLineIndex += 1;

    if (!segment) {
      return result;
    }

    result.push({
      id: `legacy-live-line-${rawIndex}`,
      label: `第 ${result.length + 1} 行`,
      content: rawLine,
      startTick: segment.startTick,
      endTick: segment.endTick,
    });

    return result;
  }, []);
}

function buildJsonTimelineItems(scoreJson, effectiveMaxTick) {
  const sections = Array.isArray(scoreJson?.sections)
    ? scoreJson.sections
    : Array.isArray(scoreJson?.meta?.sections)
      ? scoreJson.meta.sections
      : [];

  return sections
    .map((section, index) => ({
      id: section?.id ?? `json-live-section-${index}`,
      label: section?.label ?? section?.title ?? section?.name ?? `段落 ${index + 1}`,
      content: section?.description ?? section?.notes ?? '段落跳轉點',
      startTick: Math.max(0, Math.round(Number(section?.startTick ?? section?.tick ?? section?.start) || 0)),
      endTick: Number.isFinite(Number(section?.endTick ?? section?.end))
        ? Math.max(0, Math.round(Number(section?.endTick ?? section?.end)))
        : null,
    }))
    .sort((left, right) => left.startTick - right.startTick)
    .map((section, index, list) => ({
      ...section,
      endTick: section.endTick ?? list[index + 1]?.startTick ?? effectiveMaxTick,
    }))
    .filter((section) => section.endTick > section.startTick);
}

function buildFallbackTimelineItems(normalizedScore, effectiveMaxTick) {
  const beatResolution = Math.max(Number(normalizedScore.playback?.resolution) || PPQ, 1);
  const timeSigNum = Math.max(Number(normalizedScore.playback?.timeSigNum) || 4, 1);
  const timeSigDen = Math.max(Number(normalizedScore.playback?.timeSigDen) || 4, 1);
  const beatTick = Math.max(Math.round((beatResolution * 4) / timeSigDen), 1);
  const measureTick = Math.max(beatTick * timeSigNum, beatTick);
  const maxTick = Math.max(Number(effectiveMaxTick) || 0, measureTick);
  const items = [];

  for (let startTick = 0, index = 0; startTick < maxTick; startTick += measureTick, index += 1) {
    items.push({
      id: `measure-${index + 1}`,
      label: `第 ${index + 1} 小節`,
      content: `跳到第 ${index + 1} 小節`,
      startTick,
      endTick: Math.min(startTick + measureTick, maxTick),
    });
  }

  return items;
}

function findActiveTimelineItemIndex(items, currentTick) {
  if (!items.length) {
    return -1;
  }

  const safeTick = Math.max(0, Math.round(Number(currentTick) || 0));
  const matchedIndex = items.findIndex((item) => safeTick >= item.startTick && safeTick < item.endTick);

  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  if (safeTick >= items[items.length - 1].startTick) {
    return items.length - 1;
  }

  return 0;
}

const PerformanceWorkspace = memo(({ score, scoreTitle }) => {
  const activeLineRef = useRef(null);
  const scrubValueRef = useRef(null);
  const [previewTick, setPreviewTick] = useState(null);
  const {
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    playbackState,
    onSeekToTick,
    onScrubToTick,
  } = usePlayback();
  const livePlaybackState = useLivePlaybackFrame();

  const normalizedScore = useMemo(() => {
    try {
      return normalizeScoreSource(score, {
        bpm,
        timeSigNum,
        timeSigDen,
        charResolution,
      });
    } catch {
      return {
        events: [],
        maxTime: 0,
        playback: {
          bpm,
          timeSigNum,
          timeSigDen,
          resolution: PPQ,
        },
      };
    }
  }, [bpm, charResolution, score, timeSigDen, timeSigNum]);

  const effectiveMaxTick = useMemo(() => {
    const eventEndTick = normalizedScore.events.reduce((maxTick, event) => (
      Math.max(maxTick, Number(event?.tick) || 0, (Number(event?.tick) || 0) + (Number(event?.durationTicks) || 0))
    ), 0);

    return Math.max(
      Number(playbackState.maxTick) || 0,
      eventEndTick,
      Number(normalizedScore?.structure?.contentEndTick) || 0,
    );
  }, [normalizedScore, playbackState.maxTick]);

  const timelineItems = useMemo(() => {
    if (typeof score === 'string') {
      const legacyItems = buildLegacyTimelineItems(score, normalizedScore);
      if (legacyItems.length) {
        return legacyItems;
      }
    }

    if (score && typeof score === 'object') {
      const jsonItems = buildJsonTimelineItems(score, effectiveMaxTick);
      if (jsonItems.length) {
        return jsonItems;
      }
    }

    return buildFallbackTimelineItems(normalizedScore, effectiveMaxTick);
  }, [effectiveMaxTick, normalizedScore, score]);

  const activeTimelineItemIndex = useMemo(
    () => findActiveTimelineItemIndex(timelineItems, livePlaybackState.currentTick),
    [livePlaybackState.currentTick, timelineItems],
  );

  const currentDisplayTick = previewTick ?? Math.round(Number(livePlaybackState.currentTick) || 0);

  const progressPercent = useMemo(() => {
    if (effectiveMaxTick <= 0) {
      return 0;
    }

    return clamp((currentDisplayTick / effectiveMaxTick) * 100, 0, 100);
  }, [currentDisplayTick, effectiveMaxTick]);

  const handleSeek = useCallback(async (nextTick) => {
    const targetTick = clamp(Math.round(Number(nextTick) || 0), 0, Math.max(effectiveMaxTick, 0));
    if (effectiveMaxTick <= 0) {
      return;
    }

    try {
      if (!playbackState.eventsCount && normalizedScore.events.length) {
        playbackController.load(normalizedScore.events, normalizedScore.maxTime, normalizedScore.playback);
      }

      await onSeekToTick?.(targetTick);
    } catch (error) {
      console.error(error);
    }
  }, [
    effectiveMaxTick,
    normalizedScore.events,
    normalizedScore.maxTime,
    normalizedScore.playback,
    playbackState.eventsCount,
    onSeekToTick,
  ]);

  const handleScrub = useCallback((nextTick) => {
    const targetTick = clamp(Math.round(Number(nextTick) || 0), 0, Math.max(effectiveMaxTick, 0));
    setPreviewTick(targetTick);
    scrubValueRef.current = targetTick;

    if (!playbackState.eventsCount && normalizedScore.events.length) {
      playbackController.load(normalizedScore.events, normalizedScore.maxTime, normalizedScore.playback);
    }

    onScrubToTick?.(targetTick);
  }, [
    effectiveMaxTick,
    normalizedScore.events,
    normalizedScore.maxTime,
    normalizedScore.playback,
    onScrubToTick,
    playbackState.eventsCount,
  ]);

  useEffect(() => {
    if (!playbackState.isPlaying) {
      setPreviewTick(null);
      scrubValueRef.current = null;
    }
  }, [playbackState.generation, playbackState.isPlaying, playbackState.status]);

  return (
    <section className="relative z-20 mt-8 w-full max-w-6xl px-4">
      <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/88 text-slate-900 shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.10),transparent_24%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.32em] text-sky-700/70">Performance Workspace</div>
              <h2 className="mt-2 text-lg font-black text-slate-950 sm:text-xl">
                {scoreTitle?.trim() || '未命名琴譜'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                即時譜面與彈奏頁同窗顯示，可直接用進度條或段落卡跳轉。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/95 px-3 py-3 shadow-sm">
                <div className="text-slate-400">目前</div>
                <div className="mt-1 text-sm text-teal-700">{Math.round(currentDisplayTick || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/95 px-3 py-3 shadow-sm">
                <div className="text-slate-400">總長</div>
                <div className="mt-1 text-sm text-teal-700">{Math.round(effectiveMaxTick || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/95 px-3 py-3 shadow-sm">
                <div className="text-slate-400">進度</div>
                <div className="mt-1 text-sm text-teal-700">{Math.round(progressPercent)}%</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <span>時間軸跳轉</span>
              <span>{Math.round((currentDisplayTick / Math.max(effectiveMaxTick, 1)) * (normalizedScore.maxTime || 0) || 0)}s / {Math.round(normalizedScore.maxTime || 0)}s</span>
            </div>
            <div className="relative">
              <div className="h-3 rounded-full bg-slate-200" />
              <div
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 via-emerald-300 to-amber-300"
                style={{ width: `${progressPercent}%` }}
              />
              <input
                type="range"
                min="0"
                max={Math.max(effectiveMaxTick, 1)}
                step="1"
                value={Math.min(currentDisplayTick, Math.max(effectiveMaxTick, 1))}
                onChange={(event) => {
                  handleScrub(Number(event.target.value));
                }}
                onMouseUp={(event) => {
                  void handleSeek(Number(event.currentTarget.value));
                }}
                onTouchEnd={(event) => {
                  void handleSeek(Number(event.currentTarget.value));
                }}
                onKeyUp={(event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                    void handleSeek(Number(event.currentTarget.value));
                  }
                }}
                className="absolute inset-0 h-3 w-full cursor-pointer opacity-0"
                aria-label="Seek score timeline"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.35fr)_340px] lg:p-6">
          <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/92 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <ListMusic size={14} className="text-teal-700" />
              即時琴譜
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded-[22px] border border-slate-200 bg-white/82 p-3 custom-scrollbar">
              <div className="space-y-2">
                {timelineItems.map((item, index) => {
                  const isActive = index === activeTimelineItemIndex;

                  return (
                    <button
                      key={item.id}
                      ref={isActive ? activeLineRef : null}
                      type="button"
                      onClick={() => {
                        void handleSeek(item.startTick);
                      }}
                      className={`block w-full rounded-[20px] border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? 'border-teal-300 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700/70">
                            {item.label}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                            {item.content}
                          </div>
                        </div>
                        <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          {Math.round(item.startTick)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/92 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <MousePointerClick size={14} className="text-sky-700" />
              快速跳轉
            </div>
            <div className="space-y-2">
              {timelineItems.slice(0, 10).map((item, index) => {
                const isActive = index === activeTimelineItemIndex;

                return (
                  <button
                    key={`${item.id}-jump`}
                    type="button"
                    onClick={() => {
                      void handleSeek(item.startTick);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-sky-50'
                    }`}
                  >
                    <span className="truncate text-xs font-semibold">{item.label}</span>
                    <span className="ml-3 shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      {Math.round(item.startTick)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
              拖曳上方進度條可精確跳轉，點選左側譜面或右側段落卡可快速切換到對應位置。
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export default PerformanceWorkspace;
