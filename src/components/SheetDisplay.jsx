import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, Edit3, FolderOpen, RotateCcw, UploadCloud } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';
import { usePlayheadSync } from '../hooks/usePlayheadSync';
import playbackController from '../services/playbackController';
import { normalizeScoreSource, PPQ } from '../utils/score';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stripInlineComments(line) {
  return String(line ?? '').replace(/\/\/.*$/u, '');
}

function buildLegacySectionSegments(scoreText, maxTick) {
  const segments = [];
  let accumulatedTick = 0;

  String(scoreText ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine, index) => {
      const cleanedLine = stripInlineComments(rawLine).replace(/\|/gu, '').trim();
      if (!cleanedLine) {
        return;
      }

      const beatCount = cleanedLine
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .length;

      if (!beatCount) {
        return;
      }

      const startTick = accumulatedTick;
      accumulatedTick += beatCount * PPQ;

      segments.push({
        id: `section-line-${index}`,
        label: cleanedLine.length > 24 ? `${cleanedLine.slice(0, 24).trim()}...` : cleanedLine,
        startTick,
        endTick: accumulatedTick,
      });
    });

  if (!segments.length) {
    return [];
  }

  const resolvedMaxTick = Math.max(Number(maxTick) || 0, segments[segments.length - 1].endTick);

  return segments
    .map((segment, index) => ({
      ...segment,
      endTick: index < segments.length - 1 ? segments[index + 1].startTick : resolvedMaxTick,
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

function getPracticeFeedbackTone(grade) {
  if (grade === 'PERFECT') {
    return {
      panel: 'border-amber-300/35 bg-amber-400/10',
      badge: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
      headline: 'text-amber-300',
      detail: 'text-amber-100/75',
    };
  }

  if (grade === 'GOOD') {
    return {
      panel: 'border-emerald-400/30 bg-emerald-400/10',
      badge: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
      headline: 'text-emerald-300',
      detail: 'text-emerald-100/75',
    };
  }

  if (grade === 'MISS') {
    return {
      panel: 'border-rose-400/25 bg-rose-500/10',
      badge: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
      headline: 'text-rose-300',
      detail: 'text-rose-100/75',
    };
  }

  return {
    panel: 'border-white/10 bg-white/[0.03]',
    badge: 'border-white/10 bg-white/[0.04] text-white/55',
    headline: 'text-emerald-100/80',
    detail: 'text-white/45',
  };
}

function formatTickDelta(deltaTicks = 0) {
  const rounded = Math.round(Number(deltaTicks) || 0);
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

const SheetDisplay = memo(({
  score,
  setScore,
  scoreTitle,
  setScoreTitle,
  practiceFeedback,
  practiceStats,
  onImport,
  onLoadJsonDemo,
  onExport,
  onSave,
  onReset,
  isSaving,
  onConnectCloud,
  cloudStatus,
}) => {
  const fileInputRef = useRef(null);
  const playheadRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);
  const {
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    playbackState,
  } = usePlayback();
  const isJsonScore = typeof score === 'object' && score !== null;
  const scoreEditorValue = useMemo(
    () => (typeof score === 'string' ? score : JSON.stringify(score, null, 2)),
    [score],
  );
  const practiceTone = useMemo(
    () => getPracticeFeedbackTone(practiceFeedback?.grade),
    [practiceFeedback?.grade],
  );
  const normalizedScore = useMemo(() => {
    try {
      const nextScore = normalizeScoreSource(score, {
        bpm,
        timeSigNum,
        timeSigDen,
        charResolution,
      });
      const maxTick = nextScore.events.reduce(
        (currentMax, event) => Math.max(
          currentMax,
          Number(event?.tick) || 0,
          (Number(event?.tick) || 0) + (Number(event?.durationTicks ?? event?.durationTick) || 0),
        ),
        0,
      );

      return {
        ...nextScore,
        maxTick,
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
  }, [bpm, charResolution, score, timeSigDen, timeSigNum]);
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

  usePlayheadSync(playheadRef);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col shadow-2xl relative">
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
              JSON DEMO
            </button>
          ) : null}
          <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯出目前琴譜">
            <Download size={18} />
          </button>
          <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2 disabled:opacity-60">
            <UploadCloud size={16} />
            {cloudStatus === 'ready' ? (isSaving ? 'SYNC' : 'CLOUD') : (cloudStatus === 'loading' ? 'LOADING' : 'CONNECT')}
          </button>
          <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="重設目前琴譜">
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

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

      <div className="mb-4 rounded-[22px] border border-white/8 bg-black/30 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/40">
          <span>Playhead</span>
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
                  title={`Seek to ${Math.round(segment.startTick)} tick`}
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
          <span className="uppercase tracking-[0.24em] text-emerald-100/35">Practice</span>
          <span className="text-right text-white/35">
            {practiceStats?.resolvedNotes || 0} / {practiceStats?.totalNotes || 0} judged
          </span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className={`rounded-2xl border px-4 py-3 ${practiceTone.panel}`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.28em] ${practiceTone.badge}`}>
                {practiceFeedback?.grade ?? 'READY'}
              </span>
              <span className="text-[10px] font-mono tracking-[0.18em] text-white/35">
                {practiceFeedback
                  ? `${formatTickDelta(practiceFeedback.deltaTicks)} tick`
                  : `Perfect <= 40 / Good <= 120`}
              </span>
            </div>
            <div className={`mt-3 text-lg font-black tracking-[0.08em] ${practiceTone.headline}`}>
              {practiceFeedback
                ? `${practiceFeedback.noteName} ${practiceFeedback.grade}`
                : 'Press a mapped key near the playhead'}
            </div>
            <div className={`mt-1 text-[11px] ${practiceTone.detail}`}>
              {practiceFeedback
                ? (
                  practiceFeedback.grade === 'MISS'
                    ? `Missed at ${practiceFeedback.currentTick} tick`
                    : `Matched ${practiceFeedback.noteName} at ${practiceFeedback.startTick} tick`
                )
                : 'Practice mode listens to Q-U / A-J / Z-M and grades each note in real time.'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-3">
              <div className="text-[10px] font-black tracking-[0.24em] text-amber-200/70">PERFECT</div>
              <div className="mt-1 text-xl font-black text-amber-300">{practiceStats?.totals?.perfect || 0}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3">
              <div className="text-[10px] font-black tracking-[0.24em] text-emerald-200/70">GOOD</div>
              <div className="mt-1 text-xl font-black text-emerald-300">{practiceStats?.totals?.good || 0}</div>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-3">
              <div className="text-[10px] font-black tracking-[0.24em] text-rose-200/70">MISS</div>
              <div className="mt-1 text-xl font-black text-rose-300">{practiceStats?.totals?.miss || 0}</div>
            </div>
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-3">
              <div className="text-[10px] font-black tracking-[0.24em] text-sky-200/70">MAX COMBO</div>
              <div className="mt-1 text-xl font-black text-sky-300">{practiceStats?.maxCombo || 0}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-[11px] text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-black uppercase tracking-[0.22em] text-emerald-100/40">
            Measure {Number(practiceStats?.currentMeasure?.index || 0) + 1}
            {practiceStats?.totalMeasures ? ` / ${practiceStats.totalMeasures}` : ''}
          </span>
          <span>
            Perfect {practiceStats?.currentMeasure?.perfect || 0} / Good {practiceStats?.currentMeasure?.good || 0} / Miss {practiceStats?.currentMeasure?.miss || 0}
          </span>
          <span className="text-white/35">
            {practiceStats?.currentMeasure?.resolved || 0} / {practiceStats?.currentMeasure?.total || 0} notes
          </span>
        </div>
      </div>

      <textarea
        value={scoreEditorValue}
        onChange={(event) => setScore(event.target.value)}
        readOnly={isJsonScore}
        spellCheck={false}
        className="flex-1 min-h-[300px] md:min-h-[350px] bg-black/50 border border-white/5 rounded-3xl p-5 md:p-6 text-xs font-mono leading-relaxed outline-none text-emerald-100/60 custom-scrollbar shadow-inner focus:border-emerald-500/20"
      />
    </div>
  );
});

export default SheetDisplay;
