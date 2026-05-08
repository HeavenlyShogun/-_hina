import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, Edit3, FolderOpen, Link2, Plus, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import { usePlayheadSync } from '../hooks/usePlayheadSync';
import playbackController from '../services/playbackController';
import {
  analyzeLegacyScoreText,
  findActiveTokenLine,
  findActiveTokens,
  normalizeScoreSource,
  PPQ,
} from '../utils/score';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildLegacySectionSegments(scoreText, maxTick) {
  const analysis = analyzeLegacyScoreText(scoreText);
  if (!analysis.lines.length) {
    return [];
  }

  const resolvedMaxTick = Math.max(Number(maxTick) || 0, analysis.contentEndTick);

  return analysis.lines
    .map((segment, index) => ({
      ...segment,
      endTick: index < analysis.lines.length - 1 ? analysis.lines[index + 1].startTick : resolvedMaxTick,
    }))
    .filter((segment) => segment.endTick > segment.startTick);
}

function buildJsonSectionSegments(scoreJson, maxTick) {
  const rawSections = Array.isArray(scoreJson?.sections)
    ? scoreJson.sections
    : Array.isArray(scoreJson?.meta?.sections)
      ? scoreJson.meta.sections
      : [];

  if (!rawSections.length) {
    return [];
  }

  const normalizedSections = rawSections
    .map((section, index) => ({
      id: section?.id ?? `section-json-${index}`,
      label: section?.label ?? section?.title ?? section?.name ?? `段落 ${index + 1}`,
      startTick: Math.max(0, Math.round(Number(section?.startTick ?? section?.tick ?? section?.start) || 0)),
      endTick: Number.isFinite(Number(section?.endTick ?? section?.end))
        ? Math.max(0, Math.round(Number(section.endTick ?? section.end)))
        : null,
    }))
    .sort((left, right) => left.startTick - right.startTick);

  const resolvedMaxTick = Math.max(
    Number(maxTick) || 0,
    normalizedSections[normalizedSections.length - 1]?.startTick || 0,
  );

  return normalizedSections
    .map((section, index) => ({
      ...section,
      endTick: section.endTick ?? normalizedSections[index + 1]?.startTick ?? resolvedMaxTick,
    }))
    .filter((section) => section.endTick > section.startTick);
}

function createReferenceDraft() {
  return {
    id: `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    url: '',
    type: 'link',
  };
}

function findActiveSegmentIndex(segments, currentTick) {
  if (!Array.isArray(segments) || !segments.length) {
    return -1;
  }

  const safeTick = Math.max(0, Math.round(Number(currentTick) || 0));
  const matchedIndex = segments.findIndex((segment) => (
    safeTick >= segment.startTick && safeTick < segment.endTick
  ));

  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  if (safeTick >= segments[segments.length - 1].startTick) {
    return segments.length - 1;
  }

  return 0;
}

const SheetDisplay = memo(({
  score,
  setScore,
  scoreTitle,
  setScoreTitle,
  references,
  setReferences,
  referenceNotes,
  setReferenceNotes,
  onImport,
  onLoadJsonDemo,
  onExport,
  onSave,
  onReset,
  isSaving,
  onConnectCloud,
  cloudStatus,
  showScoreActions = true,
  showGuidePanel = true,
  showTimelinePanel = true,
  showReferencePanel = true,
  showScoreMap = true,
  showEditor = true,
}) => {
  const fileInputRef = useRef(null);
  const playheadRef = useRef(null);
  const previewContainerRef = useRef(null);
  const activePreviewTickRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState('');
  const {
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    textNotation,
    legacyTimingMode,
    playbackState,
  } = usePlayback();
  const livePlaybackState = useLivePlaybackFrame();
  const isJsonScore = typeof score === 'object' && score !== null;
  const scoreEditorValue = useMemo(
    () => (typeof score === 'string' ? score : JSON.stringify(score, null, 2)),
    [score],
  );
  const normalizedScore = useMemo(() => {
    try {
      const nextScore = normalizeScoreSource(score, {
        bpm,
        timeSigNum,
        timeSigDen,
        charResolution,
        textNotation,
        legacyTimingMode,
      });
      const maxTick = nextScore.events.reduce(
        (currentMax, event) => Math.max(
          currentMax,
          Number(event?.tick) || 0,
          (Number(event?.tick) || 0) + (Number(event?.durationTicks) || 0),
        ),
        0,
      );

      return {
        ...nextScore,
        maxTick: Math.max(
          maxTick,
          Number(nextScore?.structure?.contentEndTick) || 0,
        ),
      };
    } catch {
      return {
        events: [],
        maxTime: 0,
        maxTick: 0,
        playback: {
          resolution: PPQ,
          timeSigNum,
          timeSigDen,
        },
      };
    }
  }, [bpm, charResolution, legacyTimingMode, score, textNotation, timeSigDen, timeSigNum]);
  const effectiveMaxTick = Math.max(Number(playbackState.maxTick) || 0, normalizedScore.maxTick || 0);
  const timelineResolution = Math.max(Number(normalizedScore.playback?.resolution) || PPQ, 1);
  const timelineBeatTick = Math.max(
    Math.round((timelineResolution * 4) / Math.max(Number(normalizedScore.playback?.timeSigDen ?? timeSigDen) || 4, 1)),
    1,
  );
  const timelineMeasureTick = Math.max(
    timelineBeatTick * Math.max(Number(normalizedScore.playback?.timeSigNum ?? timeSigNum) || 4, 1),
    timelineBeatTick,
  );
  const timelineBackgroundStyle = useMemo(() => {
    if (effectiveMaxTick <= 0) {
      return {};
    }

    const beatPercent = clamp((timelineBeatTick / effectiveMaxTick) * 100, 0.1, 100);
    const measurePercent = clamp((timelineMeasureTick / effectiveMaxTick) * 100, beatPercent, 100);

    return {
      backgroundColor: 'rgba(255,255,255,0.04)',
      backgroundImage: [
        'linear-gradient(90deg, rgba(16,185,129,0.12), rgba(251,191,36,0.12))',
        `repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent ${beatPercent}%)`,
        `repeating-linear-gradient(90deg, rgba(251,191,36,0.18) 0, rgba(251,191,36,0.18) 2px, transparent 2px, transparent ${measurePercent}%)`,
      ].join(', '),
    };
  }, [effectiveMaxTick, timelineBeatTick, timelineMeasureTick]);
  const sectionSegments = useMemo(() => {
    if (typeof score === 'string') {
      return buildLegacySectionSegments(score, effectiveMaxTick);
    }

    if (score && typeof score === 'object') {
      return buildJsonSectionSegments(score, effectiveMaxTick);
    }

    return [];
  }, [effectiveMaxTick, score]);
  const filteredReferences = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();

    if (!query) {
      return references;
    }

    return references.filter((reference) => {
      const searchable = `${reference?.label ?? ''} ${reference?.url ?? ''} ${reference?.type ?? ''}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [referenceSearch, references]);
  const activeSegmentIndex = useMemo(
    () => findActiveSegmentIndex(sectionSegments, playbackState.currentTick),
    [playbackState.currentTick, sectionSegments],
  );
  const activeTokenTick = livePlaybackState.currentTick;
  const activeTokenIds = useMemo(() => new Set(
    findActiveTokens(normalizedScore?.structure?.tokenLines, activeTokenTick).map((token) => token.id),
  ), [activeTokenTick, normalizedScore?.structure?.tokenLines]);
  const activeTokenLineId = useMemo(
    () => findActiveTokenLine(normalizedScore?.structure?.tokenLines, activeTokenTick)?.id ?? null,
    [activeTokenTick, normalizedScore?.structure?.tokenLines],
  );

  const syncPlayheadPosition = useCallback((nextTick) => {
    const playheadElement = playheadRef.current;
    if (!playheadElement) {
      return;
    }

    const maxTick = Math.max(Number(playbackController.getState().maxTick) || 0, effectiveMaxTick, 1);
    const clampedTick = clamp(Math.round(Number(nextTick) || 0), 0, maxTick);
    const ratio = maxTick > 0 ? clampedTick / maxTick : 0;

    playheadElement.style.left = `${ratio * 100}%`;
    playheadElement.dataset.tick = String(clampedTick);
  }, [effectiveMaxTick]);

  const handleSeek = useCallback(async (nextTick) => {
    const targetMaxTick = Math.max(Number(playbackState.maxTick) || 0, normalizedScore.maxTick || 0);
    if (targetMaxTick <= 0) {
      return;
    }

    const targetTick = clamp(Math.round(Number(nextTick) || 0), 0, targetMaxTick);

    try {
      if (!playbackState.eventsCount && normalizedScore.events.length) {
        playbackController.load(normalizedScore.events, normalizedScore.maxTime, normalizedScore.playback);
      }

      syncPlayheadPosition(targetTick);
      await playbackController.seek({ tick: targetTick });
    } catch (error) {
      console.error(error);
    }
  }, [
    normalizedScore.events,
    normalizedScore.maxTick,
    normalizedScore.maxTime,
    normalizedScore.playback,
    playbackState.eventsCount,
    playbackState.maxTick,
    syncPlayheadPosition,
  ]);

  const handleTimelineClick = useCallback((event) => {
    const targetMaxTick = Math.max(Number(playbackState.maxTick) || 0, normalizedScore.maxTick || 0);
    const trackWidth = event.currentTarget.clientWidth;
    if (targetMaxTick <= 0 || trackWidth <= 0) {
      return;
    }

    const clickRatio = clamp(event.nativeEvent.offsetX / trackWidth, 0, 1);
    void handleSeek(clickRatio * targetMaxTick);
  }, [handleSeek, normalizedScore.maxTick, playbackState.maxTick]);

  const handlePreviewClick = useCallback((event) => {
    const target = event.target.closest('[data-seek-tick]');
    if (!target) {
      return;
    }

    const tickValue = Number(target.dataset.seekTick);
    if (!Number.isFinite(tickValue)) {
      return;
    }

    void handleSeek(tickValue);
  }, [handleSeek]);

  const handleAddReference = useCallback(() => {
    setReferences((prev) => [...prev, createReferenceDraft()]);
  }, [setReferences]);

  const handleReferenceChange = useCallback((id, field, value) => {
    setReferences((prev) => prev.map((reference) => (
      reference.id === id
        ? { ...reference, [field]: value }
        : reference
    )));
  }, [setReferences]);

  const handleRemoveReference = useCallback((id) => {
    setReferences((prev) => prev.filter((reference) => reference.id !== id));
  }, [setReferences]);

  usePlayheadSync(playheadRef);

  useEffect(() => {
    if (!playbackState.isPlaying) {
      activePreviewTickRef.current = null;
    }
  }, [playbackState.isPlaying]);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col shadow-2xl relative">
      {showScoreActions ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="w-full sm:flex-1 min-w-[200px] flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 focus-within:border-emerald-500/40">
          <Edit3 size={18} className="text-emerald-400" />
          <input
            value={scoreTitle}
            onChange={(event) => setScoreTitle(event.target.value)}
            className="bg-transparent outline-none flex-1 text-sm font-bold text-emerald-50"
            placeholder="輸入琴譜名稱..."
          />
          </div>
          <div className="flex flex-wrap w-full sm:w-auto gap-2">
            <input type="file" accept=".txt,.json" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯入本地琴譜">
              <FolderOpen size={18} />
            </button>
            {onLoadJsonDemo ? (
              <button onClick={onLoadJsonDemo} className="flex items-center justify-center px-4 py-3 bg-sky-500/10 hover:bg-sky-500/20 rounded-2xl border border-sky-400/20 text-sky-300 transition-all text-[11px] font-black tracking-widest" title="載入 JSON demo">
                JSON 範例
              </button>
            ) : null}
            <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯出目前琴譜">
              <Download size={18} />
            </button>
            <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2 disabled:opacity-60">
              <UploadCloud size={16} />
              {cloudStatus === 'ready' ? (isSaving ? '同步中' : '雲端儲存') : (cloudStatus === 'loading' ? '連線中' : '連線')}
            </button>
            <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="重設目前琴譜">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {showGuidePanel ? (
        <div className="bg-black/30 rounded-3xl border border-white/5 mb-6 overflow-hidden transition-all">
        <button onClick={() => setShowGuide((visible) => !visible)} className="w-full px-5 py-4 flex items-center justify-between text-emerald-400 hover:bg-white/[0.02] transition-colors outline-none">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase">
            <BookOpen size={14} />
            譜面說明
          </div>
          <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
        </button>
        {showGuide && (
          <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-white/60 bg-black/20 animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-100/80 leading-relaxed space-y-3 border-l-2 border-emerald-500 pl-4 md:col-span-2">
              <p>
                <b className="text-emerald-300">Legacy 文字譜</b>
                直接輸入鍵位字元即可播放，空白會推進節奏，括號表示和弦。
              </p>
              <p>
                <b className="text-emerald-300">JSON Score</b>
                可透過上方的 `JSON DEMO` 或匯入 `.json` 檔進行測試；載入後播放器會自動同步 BPM、音色、殘響與移調設定。
              </p>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">快速對照</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">A~Z</span>
                  <div><b className="text-emerald-200">鍵位映射</b><br />鍵盤 `Q~U / A~J / Z~M` 對應三排音域。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">( )</span>
                  <div><b className="text-emerald-200">和弦</b><br />例如 `(QWE)` 或 `(135)` 會在同一拍內依序觸發。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">JSON</span>
                  <div><b className="text-emerald-200">結構譜面</b><br />使用 `transport / playback / tracks / events` schema 描述曲目。</div>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">目前狀態</h4>
              <p className="leading-relaxed">
                {isJsonScore
                  ? '目前載入的是 JSON score。編輯區會以唯讀方式顯示結構內容，播放參數已由 metadata 同步到控制面板。'
                  : '目前載入的是文字譜。你可以直接在下方編輯並沿用既有播放流程。'}
              </p>
            </div>
          </div>
        )}
        </div>
      ) : null}

      {showTimelinePanel ? (
        <div className="mb-4 rounded-[22px] border border-white/8 bg-black/30 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/40">
          <span>播放位置</span>
          <span>{Math.round(playbackState.currentTick || 0)} / {Math.round(effectiveMaxTick || 0)} tick</span>
        </div>
        <div
          className="relative h-12 rounded-2xl overflow-hidden cursor-pointer"
          onClick={handleTimelineClick}
        >
          <div className="absolute inset-0" style={timelineBackgroundStyle} />
          <div className="absolute inset-x-1 top-1 bottom-4">
            {sectionSegments.map((segment, index) => {
              const left = effectiveMaxTick > 0 ? `${(segment.startTick / effectiveMaxTick) * 100}%` : '0%';
              const width = effectiveMaxTick > 0 ? `${((segment.endTick - segment.startTick) / effectiveMaxTick) * 100}%` : '0%';

              return (
                <button
                  key={segment.id ?? `segment-${index}`}
                  type="button"
                  className="absolute inset-y-0 rounded-xl border border-white/10 bg-emerald-500/10 px-2 text-left text-[9px] font-black tracking-[0.18em] text-emerald-100/65 transition-colors hover:bg-emerald-400/20 hover:text-emerald-50 cursor-pointer"
                  style={{ left, width }}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleSeek(segment.startTick);
                  }}
                  title={`跳到 ${Math.round(segment.startTick)} tick`}
                >
                  <span className="block truncate">{segment.label}</span>
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 h-2 rounded-full bg-black/30" />
          <div
            ref={playheadRef}
            className="pointer-events-none absolute inset-y-0 z-20 w-1.5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.85)] transition-none will-change-[left]"
            style={{ left: '0%' }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/55">
          <span className="uppercase tracking-[0.24em] text-emerald-100/35">跟隨模式</span>
          <span className="text-right text-white/35">鍵盤仍可即時演奏，目前不做評分</span>
        </div>
        </div>
      ) : null}

      {showReferencePanel ? (
        <div className="mb-6 rounded-[22px] border border-sky-400/15 bg-sky-500/[0.05] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-200/55">參考資料</div>
            <div className="mt-1 text-sm text-sky-50/85">
              可保存琴譜規格、編曲備註、雲端連結或來源參考。
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={referenceSearch}
              onChange={(event) => setReferenceSearch(event.target.value)}
              className="min-w-[180px] rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35"
              placeholder="搜尋參考資料"
            />
            <button
              type="button"
              onClick={handleAddReference}
              className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-[11px] font-black tracking-[0.22em] text-sky-100 transition-colors hover:bg-sky-500/18"
            >
              <Plus size={14} />
              新增
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredReferences.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-sky-100/45">
              尚無參考資料。可新增來源連結、共用雲端、琴譜貼文或編曲備註。
            </div>
          ) : filteredReferences.map((reference) => (
            <div
              key={reference.id}
              className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
            >
              <input
                value={reference.type ?? 'link'}
                onChange={(event) => handleReferenceChange(reference.id, 'type', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.18em] text-sky-100/75 outline-none focus:border-sky-300/35"
                placeholder="類型"
              />
              <input
                value={reference.label ?? ''}
                onChange={(event) => handleReferenceChange(reference.id, 'label', event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35"
                placeholder="標籤"
              />
              <div className="flex items-center gap-2">
                <Link2 size={14} className="shrink-0 text-sky-200/45" />
                <input
                  value={reference.url ?? ''}
                  onChange={(event) => handleReferenceChange(reference.id, 'url', event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35"
                  placeholder="https://..."
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveReference(reference.id)}
                className="flex items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-rose-200 transition-colors hover:bg-rose-500/18"
                title="移除參考資料"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {filteredReferences.length > 0 ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200/50">
              快速連結
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredReferences
                .filter((reference) => reference?.url)
                .map((reference) => (
                  <a
                    key={`${reference.id}-link`}
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100 transition-colors hover:bg-sky-500/18"
                  >
                    <Link2 size={13} />
                    <span>{reference.label || reference.url}</span>
                  </a>
                ))}
            </div>
          </div>
        ) : null}

        <textarea
          value={referenceNotes}
          onChange={(event) => setReferenceNotes(event.target.value)}
          spellCheck={false}
          className="mt-4 min-h-[110px] w-full rounded-[22px] border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-sky-50/80 outline-none focus:border-sky-300/35"
          placeholder="在這裡寫下規格備註：來源版本、編曲說明、BPM 假設、段落地圖、匯入注意事項、共用雲端規則或查找關鍵字。"
        />

        {referenceNotes.trim() ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200/50">
              備註預覽
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-sky-50/80">
              {referenceNotes}
            </div>
          </div>
        ) : null}
        </div>
      ) : null}

      {showScoreMap ? (
        <div className="mb-6 rounded-[22px] border border-emerald-400/12 bg-emerald-500/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/55">
            琴譜地圖
          </div>
          <div className="text-[10px] text-emerald-100/40">
            點擊段落即可跳轉
          </div>
        </div>
        <div
          ref={previewContainerRef}
          onClick={handlePreviewClick}
          className="max-h-[240px] overflow-y-auto rounded-[20px] border border-white/10 bg-black/25 p-3 custom-scrollbar"
        >
          {Array.isArray(normalizedScore?.structure?.tokenLines) && normalizedScore.structure.tokenLines.length > 0 ? (
            <div className="space-y-3">
              {normalizedScore.structure.tokenLines.map((line) => {
                const isLineActive = line.id === activeTokenLineId;

                return (
                  <div
                    key={line.id}
                    className={`rounded-2xl border px-4 py-3 transition-colors ${
                      isLineActive
                        ? 'border-amber-300/35 bg-amber-400/10'
                        : 'border-white/8 bg-black/30'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
                      <span>{line.trackId}</span>
                      <span>{Math.round(line.startTick)}-{Math.round(line.endTick)} tick</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm leading-relaxed text-emerald-100/80">
                      {line.tokens.map((token) => {
                        const isActive = activeTokenIds.has(token.id);

                        if (token.isBar) {
                          return (
                            <span key={token.id} className="px-1 text-white/30">
                              {token.text}
                            </span>
                          );
                        }

                        return (
                          <button
                            key={token.id}
                            type="button"
                            data-seek-tick={token.startTick}
                            className={`rounded-lg px-2 py-1 font-mono transition-colors ${
                              isActive
                                ? 'bg-amber-300 text-slate-950 shadow-[0_0_18px_rgba(252,211,77,0.35)]'
                                : 'bg-white/5 text-emerald-100/75 hover:bg-emerald-500/12'
                            }`}
                          >
                            {token.text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : sectionSegments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-emerald-100/40">
              這份琴譜目前沒有可點擊段落。
            </div>
          ) : (
            <div className="space-y-2">
              {sectionSegments.map((segment, index) => {
                const isActive = index === activeSegmentIndex;

                return (
                  <button
                    key={segment.id ?? `preview-segment-${index}`}
                    type="button"
                    data-seek-tick={segment.startTick}
                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-50'
                        : 'border-white/8 bg-black/30 text-emerald-100/75 hover:border-emerald-400/25 hover:bg-emerald-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold">
                        {segment.label}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-white/35">
                        {Math.round(segment.startTick)} tick
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      ) : null}

      {showEditor ? (
        <textarea
        value={scoreEditorValue}
        onChange={(event) => setScore(event.target.value)}
        readOnly={isJsonScore}
        spellCheck={false}
        className="flex-1 min-h-[300px] md:min-h-[350px] bg-black/50 border border-white/5 rounded-3xl p-5 md:p-6 text-xs font-mono leading-relaxed outline-none text-emerald-100/60 custom-scrollbar shadow-inner focus:border-emerald-500/20"
      />
      ) : null}
    </div>
  );
});

export default SheetDisplay;
