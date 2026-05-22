import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, Edit3, FileJson, FolderOpen, Link2, Music2, Plus, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import { usePlayheadSync } from '../hooks/usePlayheadSync';
import { SCORE_NAME_PRESETS, SCORE_TITLE_DATALIST_ID } from '../config/branding';
import playbackController from '../services/playbackController';
import {
  analyzeLegacyScoreText,
  findActiveTokenLine,
  findActiveTokens,
  normalizeScoreSource,
  PPQ,
} from '../utils/score';

const LARGE_JSON_EVENT_LIMIT = 500;
const MUSICXML_HELP_URL = 'https://acestudio.ai/pdf-to-musicxml?step=1';

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
      label: section?.label ?? section?.title ?? section?.name ?? `Section ${index + 1}`,
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

function buildCompactTokenLineGroups(tokenLines) {
  if (!Array.isArray(tokenLines) || tokenLines.length === 0) {
    return [];
  }

  return tokenLines.reduce((groups, line) => {
    const previousGroup = groups[groups.length - 1];
    if (previousGroup && previousGroup.trackId === line.trackId) {
      previousGroup.lines.push(line);
      previousGroup.endTick = Math.max(previousGroup.endTick, line.endTick);
      return groups;
    }

    groups.push({
      id: `${line.trackId}-${groups.length}`,
      trackId: line.trackId,
      startTick: line.startTick,
      endTick: line.endTick,
      lines: [line],
    });
    return groups;
  }, []);
}

function shouldHidePreviewToken(token) {
  if (!token) {
    return true;
  }

  if (token.isBar) {
    return true;
  }

  return token.isHold && /^-+$/u.test(String(token.displayText ?? token.text ?? '').trim());
}

function countJsonScoreEvents(scoreJson) {
  if (!scoreJson || typeof scoreJson !== 'object') {
    return 0;
  }

  return (Array.isArray(scoreJson.tracks) ? scoreJson.tracks : []).reduce(
    (count, track) => count + (Array.isArray(track?.events) ? track.events.length : 0),
    0,
  );
}

function getJsonTrackSummaries(scoreJson) {
  return (Array.isArray(scoreJson?.tracks) ? scoreJson.tracks : []).map((track, index) => ({
    id: track?.id ?? `track-${index + 1}`,
    name: track?.name ?? track?.id ?? `Track ${index + 1}`,
    events: Array.isArray(track?.events) ? track.events.length : 0,
  }));
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
  const audioConfig = useAudioConfig();
  const livePlaybackState = useLivePlaybackFrame();
  const isJsonScore = typeof score === 'object' && score !== null;
  const jsonScoreEventCount = isJsonScore ? countJsonScoreEvents(score) : 0;
  const shouldSummarizeJsonEditor = isJsonScore && jsonScoreEventCount > LARGE_JSON_EVENT_LIMIT;
  const jsonTrackSummaries = useMemo(() => (isJsonScore ? getJsonTrackSummaries(score) : []), [isJsonScore, score]);
  const scoreEditorValue = useMemo(
    () => {
      if (typeof score === 'string') {
        return score;
      }

      if (shouldSummarizeJsonEditor) {
        const title = score?.meta?.displayTitle ?? score?.meta?.title ?? 'JSON 譜面';
        const tracks = Array.isArray(score?.tracks) ? score.tracks.length : 0;
        const scoreBpm = score?.transport?.bpm ?? '未設定';
        return [
          `${title}`,
          '',
          '已載入大型 JSON 譜面，可直接播放與匯出。',
          `軌道數：${tracks}`,
          `事件數：${jsonScoreEventCount}`,
          `BPM: ${scoreBpm}`,
          '',
          '可使用上方工具列匯出 JSON 或 MIDI。',
        ].join('\n');
      }

      return JSON.stringify(score, null, 2);
    },
    [jsonScoreEventCount, score, shouldSummarizeJsonEditor],
  );
  const normalizedScore = useMemo(() => {
    try {
      const nextScore = normalizeScoreSource(score, {
        bpm,
        timeSigNum,
        timeSigDen,
        charResolution,
        globalKeyOffset: audioConfig?.globalKeyOffset,
        scaleMode: audioConfig?.scaleMode,
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
  }, [
    audioConfig?.globalKeyOffset,
    audioConfig?.scaleMode,
    bpm,
    charResolution,
    legacyTimingMode,
    score,
    textNotation,
    timeSigDen,
    timeSigNum,
  ]);
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
  const compactTokenLineGroups = useMemo(
    () => buildCompactTokenLineGroups(normalizedScore?.structure?.tokenLines),
    [normalizedScore?.structure?.tokenLines],
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
    if (normalizedScore && playbackController) {
      playbackController.load(normalizedScore.events, normalizedScore.maxTime, normalizedScore.playback);
      syncPlayheadPosition(0);
    }
  }, [normalizedScore, syncPlayheadPosition]);

  return (
    <div className="relative flex flex-col rounded-[40px] border border-white/5 bg-white/[0.02] p-6 shadow-2xl md:p-8">
      {showScoreActions ? (
        <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex w-full min-w-[200px] items-center gap-4 rounded-2xl border border-white/10 bg-black/40 px-5 py-3 focus-within:border-emerald-500/40 sm:flex-1">
            <Edit3 size={18} className="text-emerald-400" />
            <input
              value={scoreTitle}
              onChange={(event) => setScoreTitle(event.target.value)}
              list={SCORE_TITLE_DATALIST_ID}
              className="flex-1 bg-transparent text-sm font-bold text-emerald-50 outline-none"
              placeholder="輸入譜面名稱..."
            />
            <datalist id={SCORE_TITLE_DATALIST_ID}>
              {SCORE_NAME_PRESETS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input type="file" accept=".txt,.json,.musicxml,.xml,.mid,.midi" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-3 text-emerald-400 transition-all hover:bg-white/10" title="匯入譜面">
              <FolderOpen size={18} />
            </button>
            {onLoadJsonDemo ? (
              <button onClick={onLoadJsonDemo} className="flex items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-[11px] font-black tracking-widest text-sky-300 transition-all hover:bg-sky-500/20" title="載入 JSON demo">
                JSON 範例
              </button>
            ) : null}
            <button onClick={() => onExport?.('json')} className="flex items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-3 text-emerald-400 transition-all hover:bg-white/10" title="下載 JSON">
              <FileJson size={18} />
            </button>
            <button onClick={() => onExport?.('midi')} className="flex items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-3 text-sky-300 transition-all hover:bg-white/10" title="下載 MIDI">
              <Music2 size={18} />
            </button>
            <button onClick={() => onExport?.('source')} className="flex items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-3 text-emerald-400 transition-all hover:bg-white/10" title="下載原始譜面">
              <Download size={18} />
            </button>
            <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="ml-1 flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600/80 px-6 py-3 text-xs font-black text-white shadow-lg transition-all hover:bg-emerald-600 disabled:opacity-60 sm:ml-2 sm:flex-none">
              <UploadCloud size={16} />
              {cloudStatus === 'ready' ? (isSaving ? '儲存中' : '存入雲端') : (cloudStatus === 'loading' ? '連線中' : '連線雲端')}
            </button>
            <button onClick={onReset} className="flex items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400 transition-all hover:bg-rose-500/20" title="重設譜面">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {showGuidePanel ? (
        <div className="mb-6 overflow-hidden rounded-3xl border border-white/5 bg-black/30 transition-all">
          <button onClick={() => setShowGuide((visible) => !visible)} className="flex w-full items-center justify-between px-5 py-4 text-emerald-400 outline-none transition-colors hover:bg-white/[0.02]">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <BookOpen size={14} />
              譜面格式與轉換流程
            </div>
            <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
          </button>
          {showGuide && (
            <div className="grid grid-cols-1 gap-6 border-t border-white/5 bg-black/20 p-6 text-[11px] text-white/60 animate-in fade-in slide-in-from-top-2 md:grid-cols-2">
              <div className="space-y-3 border-l-2 border-emerald-500 pl-4 leading-relaxed text-emerald-100/80 md:col-span-2">
                <p><b className="text-emerald-300">鍵盤文字譜</b> 可直接貼上鍵盤譜，例如 `Q~U / A~J / Z~M`，括號代表同時按下的和弦。</p>
                <p><b className="text-emerald-300">JSON 譜面</b> 適合大型譜面與 MIDI/MusicXML 轉換結果，會保存 `transport`、`playback`、`tracks` 和事件資料。</p>
                <p><b className="text-emerald-300">數字節拍格線</b> 可使用 `@grid 1/8`、`@grid 1/12`、`@grid 1/16`、`@grid 1/24` 或 `@grid 1/32` 指定節拍格線；其中 `1/12`、`1/24` 適合三連音與 Swing。</p>
              </div>
              <div>
                <h4 className="mb-3 border-b border-white/10 pb-1 font-bold text-emerald-300">輸入方式</h4>
                <ul className="space-y-4">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 font-mono text-emerald-400">A~Z</span>
                    <div><b className="text-emerald-200">鍵盤譜</b><br />輸入 `Q~U / A~J / Z~M`，系統會對應三排琴鍵。</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 font-mono text-emerald-400">( )</span>
                    <div><b className="text-emerald-200">和弦</b><br />例如 `(QWE)` 或 `(135)`，括號內的音會同時播放。</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 font-mono text-emerald-400">JSON</span>
                    <div><b className="text-emerald-200">結構化譜面</b><br />匯入含 `transport / playback / tracks / events` 的 JSON 可保留完整時間軸。</div>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-3 border-b border-white/10 pb-1 font-bold text-emerald-300">MusicXML 轉換流程</h4>
                <ol className="space-y-3 leading-relaxed">
                  <li>1. 若來源是 PDF 或圖片，先用 ACE Studio 將 PDF/JPG/PNG 轉為 MusicXML。</li>
                  <li>2. 下載 MusicXML 檔案後，在本頁使用匯入按鈕載入 `.musicxml` 或 `.xml`。</li>
                  <li>3. 檢查轉換後的節奏與調性，必要時在控制面板調整 BPM、拍號與調性。</li>
                  <li>4. 按「寫入目前節奏與調性」或直接存檔/匯出，系統會把調整值寫入譜面。</li>
                </ol>
                <a href={MUSICXML_HELP_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-100 transition-colors hover:bg-sky-500/18">
                  <Link2 size={13} />
                  ACE Studio PDF to MusicXML
                </a>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showTimelinePanel ? (
        <div className="mb-4 rounded-[22px] border border-white/8 bg-black/30 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/40">
            <span>播放時間軸</span>
            <span>{Math.round(playbackState.currentTick || 0)} / {Math.round(effectiveMaxTick || 0)} tick</span>
          </div>
          <div className="relative h-12 cursor-pointer overflow-hidden rounded-2xl" onClick={handleTimelineClick}>
            <div className="absolute inset-0" style={timelineBackgroundStyle} />
            <div className="absolute inset-x-1 bottom-4 top-1">
              {sectionSegments.map((segment) => {
                const left = effectiveMaxTick > 0 ? `${(segment.startTick / effectiveMaxTick) * 100}%` : '0%';
                const width = effectiveMaxTick > 0 ? `${((segment.endTick - segment.startTick) / effectiveMaxTick) * 100}%` : '0%';

                return (
                  <button
                    key={segment.id}
                    type="button"
                    className="absolute inset-y-0 cursor-pointer rounded-xl border border-white/10 bg-emerald-500/10 px-2 text-left text-[9px] font-black tracking-[0.18em] text-emerald-100/65 transition-colors hover:bg-emerald-400/20 hover:text-emerald-50"
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
            <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 z-20 w-1.5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.85)] transition-none will-change-[left]" style={{ left: '0%' }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/55">
            <span className="uppercase tracking-[0.24em] text-emerald-100/35">Tick 預覽</span>
            <span className="text-right text-white/35">點擊段落或時間軸可跳到指定位置。</span>
          </div>
        </div>
      ) : null}

      {showReferencePanel ? (
        <div className="mb-6 rounded-[22px] border border-sky-400/15 bg-sky-500/[0.05] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-200/55">參考資料</div>
              <div className="mt-1 text-sm text-sky-50/85">可記錄來源網址、編曲備註、轉調或 BPM 判斷依據。</div>
            </div>
            <div className="flex gap-2">
              <input value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} className="min-w-[180px] rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35" placeholder="搜尋參考資料" />
              <button type="button" onClick={handleAddReference} className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-[11px] font-black tracking-[0.22em] text-sky-100 transition-colors hover:bg-sky-500/18">
                <Plus size={14} />
                新增
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredReferences.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-sky-100/45">尚未建立參考資料，可新增來源、YouTube 連結或轉譜備註。</div>
            ) : filteredReferences.map((reference) => (
              <div key={reference.id} className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                <input value={reference.type ?? 'link'} onChange={(event) => handleReferenceChange(reference.id, 'type', event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.18em] text-sky-100/75 outline-none focus:border-sky-300/35" placeholder="類型" />
                <input value={reference.label ?? ''} onChange={(event) => handleReferenceChange(reference.id, 'label', event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35" placeholder="標題" />
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="shrink-0 text-sky-200/45" />
                  <input value={reference.url ?? ''} onChange={(event) => handleReferenceChange(reference.id, 'url', event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-sky-50/85 outline-none focus:border-sky-300/35" placeholder="https://..." />
                </div>
                <button type="button" onClick={() => handleRemoveReference(reference.id)} className="flex items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-rose-200 transition-colors hover:bg-rose-500/18" title="刪除參考資料">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {filteredReferences.length > 0 ? (
            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200/50">快速連結</div>
              <div className="flex flex-wrap gap-2">
                {filteredReferences.filter((reference) => reference?.url).map((reference) => (
                  <a key={`${reference.id}-link`} href={reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100 transition-colors hover:bg-sky-500/18">
                    <Link2 size={13} />
                    <span>{reference.label || reference.url}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <textarea value={referenceNotes} onChange={(event) => setReferenceNotes(event.target.value)} spellCheck={false} className="mt-4 min-h-[110px] w-full rounded-[22px] border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-sky-50/80 outline-none focus:border-sky-300/35" placeholder="可記錄 BPM、調性、來源版本、MusicXML 轉換注意事項或手動修正備註。" />

          {referenceNotes.trim() ? (
            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200/50">備註預覽</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-sky-50/80">{referenceNotes}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showScoreMap ? (
        <div className="mb-6 rounded-[22px] border border-emerald-400/12 bg-emerald-500/[0.04] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/55">譜面預覽</div>
            <div className="text-[10px] text-emerald-100/40">點擊音符或段落可跳轉播放位置</div>
          </div>
          <div onClick={handlePreviewClick} className="custom-scrollbar max-h-[240px] overflow-y-auto rounded-[20px] border border-white/10 bg-black/25 p-3">
            {compactTokenLineGroups.length > 0 ? (
              <div className="space-y-4">
                {compactTokenLineGroups.map((group) => {
                  const isGroupActive = group.lines.some((line) => line.id === activeTokenLineId);

                  return (
                    <div key={group.id} className={`rounded-2xl border px-4 py-3 transition-colors ${isGroupActive ? 'border-amber-300/35 bg-amber-400/10' : 'border-white/8 bg-black/30'}`}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
                        <span>{group.trackId}</span>
                        <span>{Math.round(group.startTick)}-{Math.round(group.endTick)} tick</span>
                      </div>
                      <div className="flex flex-wrap items-start gap-2 text-sm leading-relaxed text-emerald-100/80">
                        {group.lines.flatMap((line) => line.tokens).filter((token) => !shouldHidePreviewToken(token)).map((token) => {
                          const isActive = activeTokenIds.has(token.id);

                          if (token.isBar) {
                            return <span key={token.id} className="px-1 text-white/30">{token.text}</span>;
                          }

                          return (
                            <button key={token.id} type="button" data-seek-tick={token.startTick} title={`${token.text}${token.durationLabel ? ` | ${token.durationLabel} 拍` : ''}`} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono transition-colors ${isActive ? 'bg-amber-300 text-slate-950 shadow-[0_0_18px_rgba(252,211,77,0.35)]' : token.isRest ? 'bg-slate-500/10 text-slate-200/65 hover:bg-slate-400/15' : 'bg-white/5 text-emerald-100/75 hover:bg-emerald-500/12'}`}>
                              <span>{token.displayText ?? token.text}</span>
                              {token.durationLabel && !String(token.displayText ?? token.text).includes(token.durationLabel) ? (
                                <span className={`rounded px-1 text-[9px] ${isActive ? 'bg-slate-950/10 text-slate-950/70' : 'bg-black/25 text-white/45'}`}>{token.durationLabel}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : sectionSegments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-emerald-100/40">目前沒有可預覽的譜面段落，請匯入或輸入譜面。</div>
            ) : (
              <div className="space-y-2">
                {sectionSegments.map((segment, index) => {
                  const isActive = index === activeSegmentIndex;

                  return (
                    <button key={segment.id} type="button" data-seek-tick={segment.startTick} className={`block w-full rounded-2xl border px-4 py-3 text-left transition-colors ${isActive ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-50' : 'border-white/8 bg-black/30 text-emerald-100/75 hover:border-emerald-400/25 hover:bg-emerald-500/10'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold">{segment.label}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-white/35">{Math.round(segment.startTick)} tick</span>
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
        <div className="space-y-4">
          {isJsonScore ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[24px] border border-emerald-400/12 bg-emerald-500/[0.05] p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/55">譜面摘要</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-emerald-50/85">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">標題</div>
                    <div className="mt-1 break-words font-semibold">{score?.meta?.displayTitle ?? score?.meta?.title ?? 'JSON 譜面'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">格式</div>
                    <div className="mt-1 font-semibold">{score?.version ?? 'json'} / {score?.meta?.originalFormat ?? score?.meta?.sourceType ?? 'score'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">速度</div>
                    <div className="mt-1 font-semibold">{score?.transport?.bpm ?? bpm} BPM</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">拍號</div>
                    <div className="mt-1 font-semibold">{score?.transport?.timeSigNum ?? timeSigNum}/{score?.transport?.timeSigDen ?? timeSigDen}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/55">軌道</div>
                  <div className="text-xs text-emerald-100/45">{jsonScoreEventCount} 個事件</div>
                </div>
                <div className="custom-scrollbar max-h-[160px] space-y-2 overflow-y-auto pr-1">
                  {jsonTrackSummaries.map((track) => (
                    <div key={track.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50/80">
                      <span className="truncate font-semibold">{track.name}</span>
                      <span className="shrink-0 text-xs text-emerald-100/45">{track.events} 個音符</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[24px] border border-emerald-400/12 bg-emerald-500/[0.045] p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/60">
              <BookOpen size={14} />
              新手編輯演示
            </div>
            <div className="grid gap-3 text-xs text-emerald-50/72 md:grid-cols-[1fr_1.1fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-emerald-100">
                  <Edit3 size={14} />
                  1. 寫入音符
                </div>
                <p className="leading-relaxed">文字譜可直接輸入鍵位；一行代表一段，括號表示同時按下的和弦。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 font-mono text-[11px] leading-6 text-emerald-50/80">
                <div>@grid 1/8</div>
                <div>Q W E R | T Y U -</div>
                <div>(Q E T) - W - | R T Y U</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-emerald-100">
                  <Music2 size={14} />
                  2. 播放檢查
                </div>
                <p className="leading-relaxed">輸入後用上方播放控制試聽；若是 JSON 譜面，先用轉換器載入再從摘要檢查拍速與軌道。</p>
              </div>
            </div>
          </div>

          <textarea value={scoreEditorValue} onChange={(event) => setScore(event.target.value)} readOnly={isJsonScore} spellCheck={false} className="custom-scrollbar flex-1 min-h-[320px] rounded-3xl border border-white/5 bg-black/55 p-5 font-mono text-[13px] leading-7 text-emerald-50/78 shadow-inner outline-none focus:border-emerald-500/20 md:min-h-[380px] md:p-6" />
        </div>
      ) : null}
    </div>
  );
});

export default SheetDisplay;
