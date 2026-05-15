import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Music2,
  RefreshCcw,
  Trash2,
  Wand2,
} from 'lucide-react';
import { normalizeScoreSource } from '../utils/score';
import { parseMidiToV2 } from '../utils/midiToV2';
import { convertMusicXmlToSlim } from '../utils/musicXmlToSlim';
import { scoreJsonToMidiBytes } from '../utils/scoreToMidi';
import { APP_NAME, DEFAULT_SCORE_NAME } from '../config/branding';
import { applyScoreSettingsToJsonContent, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import {
  buildAiConversionPrompt,
  tryParseJsonScoreText,
} from '../utils/scoreConversionAssist';

const EXTERNAL_INPUT_TYPES = {
  JIANPU: 'jianpu',
  STAFF: 'staff',
  MIXED: 'mixed',
};

const OUTPUT_FORMATS = {
  NUMBERED_GRID: 'numbered-grid',
  JSON_V2: 'json-v2',
};

const LARGE_FILE_WARNING_BYTES = 5 * 1024 * 1024;

function slugifyFilename(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.ceil(bytes / 1024)} KB`;
}

function createJsonScoreSchema({
  title,
  rawText,
  sourceType,
  playbackConfig,
  normalized,
  references,
  referenceNotes,
}) {
  return {
    version: '2.0',
    meta: {
      id: `${slugifyFilename(title)}-${Date.now()}`,
      title: title || DEFAULT_SCORE_NAME,
      sourceType,
      migratedAt: new Date().toISOString(),
      originalFormat: sourceType,
      references: Array.isArray(references) ? references : [],
      referenceNotes: typeof referenceNotes === 'string' ? referenceNotes : '',
    },
    transport: {
      bpm: normalized.playback.bpm,
      timeSigNum: normalized.playback.timeSigNum,
      timeSigDen: normalized.playback.timeSigDen,
      resolution: normalized.playback.resolution,
    },
    playback: {
      tone: playbackConfig.tone,
      globalKeyOffset: playbackConfig.globalKeyOffset,
      reverb: playbackConfig.reverb,
      scaleMode: playbackConfig.scaleMode,
      accidentals: playbackConfig.accidentals,
    },
    source: {
      rawText,
    },
    tracks: [
      {
        id: 'main',
        name: 'Main',
        mute: false,
        events: normalized.events
          .filter((event) => !event.isRest)
          .map((event) => ({
            type: 'note',
            startTick: event.startTick ?? event.tick,
            durationTicks: event.durationTicks,
            key: event.k ?? null,
            velocity: Number((event.velocity ?? event.v ?? 0.85).toFixed(4)),
            frequency: event.frequency ?? null,
            noteName: event.noteName ?? null,
          })),
      },
    ],
  };
}

function ensurePayloadMetadata(payload, {
  title,
  playbackConfig,
  references,
  referenceNotes,
  rawText,
}) {
  const transport = payload?.transport ?? {};
  const playback = payload?.playback ?? {};
  const meta = payload?.meta ?? {};

  return {
    ...payload,
    version: payload?.version ?? '2.0',
    meta: {
      ...meta,
      id: meta.id ?? `${slugifyFilename(title)}-${Date.now()}`,
      title: meta.title ?? title,
      references: Array.isArray(meta.references) && meta.references.length > 0
        ? meta.references
        : (Array.isArray(references) ? references : []),
      referenceNotes:
        typeof meta.referenceNotes === 'string' && meta.referenceNotes.trim()
          ? meta.referenceNotes
          : (typeof referenceNotes === 'string' ? referenceNotes : ''),
    },
    transport: {
      bpm: playbackConfig.bpm,
      timeSigNum: playbackConfig.timeSigNum,
      timeSigDen: playbackConfig.timeSigDen,
      resolution: Number(transport.resolution) || 480,
    },
    playback: {
      tone: playbackConfig.tone ?? playback.tone,
      globalKeyOffset: Number(playbackConfig.globalKeyOffset) || 0,
      reverb: playbackConfig.reverb ?? playback.reverb,
      scaleMode: playbackConfig.scaleMode ?? playback.scaleMode,
      accidentals: playbackConfig.accidentals,
    },
    source: {
      ...(payload?.source ?? {}),
      rawText: payload?.source?.rawText ?? rawText,
    },
  };
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadBinaryFile(filename, bytes, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatusBadge({ label, value }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold text-amber-50/85">
      <span className="shrink-0 uppercase tracking-[0.18em] text-amber-200/45">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </span>
  );
}

const ScoreConverter = memo(({
  scoreTitle,
  scoreDocument,
  bpm,
  timeSigNum,
  timeSigDen,
  charResolution,
  audioConfig,
  accidentals,
  references,
  referenceNotes,
  showToast,
  onLoadLocalScore,
  onClearCurrentScore,
}) => {
  const midiInputRef = useRef(null);
  const musicXmlInputRef = useRef(null);
  const [inputValue, setInputValue] = useState(scoreDocument.rawText ?? '');
  const [externalInputType, setExternalInputType] = useState(EXTERNAL_INPUT_TYPES.JIANPU);
  const [aiOutputFormat, setAiOutputFormat] = useState(OUTPUT_FORMATS.JSON_V2);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [midiImportStatus, setMidiImportStatus] = useState('尚未匯入 MIDI');
  const [musicXmlImportStatus, setMusicXmlImportStatus] = useState('尚未匯入 MusicXML');
  const [isImportingMidi, setIsImportingMidi] = useState(false);
  const [isImportingMusicXml, setIsImportingMusicXml] = useState(false);
  const [isDraggingMusicXml, setIsDraggingMusicXml] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  useEffect(() => {
    if (scoreDocument.sourceType === SCORE_SOURCE_TYPES.TEXT) {
      setInputValue(scoreDocument.rawText ?? '');
    }
  }, [scoreDocument.rawText, scoreDocument.sourceType]);

  const playbackConfig = useMemo(() => ({
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    textNotation: scoreDocument.textNotation,
    legacyTimingMode: scoreDocument.legacyTimingMode,
    tone: audioConfig?.tone,
    globalKeyOffset: audioConfig?.globalKeyOffset,
    reverb: audioConfig?.reverb,
    scaleMode: audioConfig?.scaleMode,
    accidentals,
  }), [
    accidentals,
    audioConfig?.globalKeyOffset,
    audioConfig?.reverb,
    audioConfig?.scaleMode,
    audioConfig?.tone,
    bpm,
    charResolution,
    scoreDocument.legacyTimingMode,
    scoreDocument.textNotation,
    timeSigDen,
    timeSigNum,
  ]);

  const settingsHint = `下載的 JSON 將包含目前 BPM ${bpm}、拍號 ${timeSigNum}/${timeSigDen}、調性偏移 ${audioConfig?.globalKeyOffset ?? 0}`;

  const refreshAssistantPrompt = useCallback((nextInputValue = inputValue) => {
    const prompt = buildAiConversionPrompt({
      title: scoreTitle.trim() || DEFAULT_SCORE_NAME,
      notationType: externalInputType,
      outputFormat: aiOutputFormat,
      playbackConfig,
      references,
      referenceNotes,
      sourceText: nextInputValue,
    });
    setAssistantPrompt(prompt);
    return prompt;
  }, [
    aiOutputFormat,
    externalInputType,
    inputValue,
    playbackConfig,
    referenceNotes,
    references,
    scoreTitle,
  ]);

  useEffect(() => {
    if (isAdvancedOpen) {
      refreshAssistantPrompt();
    }
  }, [isAdvancedOpen, refreshAssistantPrompt]);

  const buildPayload = useCallback(() => {
    const maybeJsonScore = tryParseJsonScoreText(inputValue);
    const title = scoreTitle.trim() || DEFAULT_SCORE_NAME;

    if (maybeJsonScore) {
      return applyScoreSettingsToJsonContent(
        ensurePayloadMetadata(maybeJsonScore, {
          title,
          playbackConfig,
          references,
          referenceNotes,
          rawText: inputValue,
        }),
        {
          ...playbackConfig,
          title,
        },
      );
    }

    const normalized = normalizeScoreSource(inputValue, playbackConfig);
    return applyScoreSettingsToJsonContent(
      createJsonScoreSchema({
        title,
        rawText: inputValue,
        sourceType: SCORE_SOURCE_TYPES.TEXT,
        playbackConfig,
        normalized,
        references,
        referenceNotes,
      }),
      {
        ...playbackConfig,
        title,
      },
    );
  }, [inputValue, playbackConfig, referenceNotes, references, scoreTitle]);

  const confirmLargeFile = useCallback((file) => {
    if (!file || file.size <= LARGE_FILE_WARNING_BYTES) {
      return true;
    }

    return window.confirm(
      `檔案大小為 ${formatBytes(file.size)}，轉換可能需要較多時間或造成畫面卡頓。是否繼續？`,
    );
  }, []);

  const handleSyncCurrent = useCallback(() => {
    const nextValue = scoreDocument.rawText ?? '';
    setInputValue(nextValue);
    refreshAssistantPrompt(nextValue);
    showToast?.('已同步目前編輯器內容', 'success');
  }, [refreshAssistantPrompt, scoreDocument.rawText, showToast]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      const prompt = refreshAssistantPrompt();
      await window.navigator.clipboard.writeText(prompt);
      showToast?.('已複製 AI 提示詞', 'success');
    } catch (error) {
      console.error(error);
      showToast?.('複製提示詞失敗', 'error');
    }
  }, [refreshAssistantPrompt, showToast]);

  const handleLoadToEditor = useCallback(() => {
    try {
      const payload = buildPayload();
      onLoadLocalScore?.(payload);
      showToast?.(`已載入譜面：${payload.meta?.title ?? scoreTitle}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('載入譜面失敗', 'error');
    }
  }, [buildPayload, onLoadLocalScore, scoreTitle, showToast]);

  const handleDownloadJson = useCallback(() => {
    try {
      const payload = buildPayload();
      const filename = `${slugifyFilename(scoreTitle || payload.meta?.title || 'score')}-with-settings.json`;
      downloadJsonFile(filename, payload);
      showToast?.(`已下載 ${filename}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('下載 JSON 失敗', 'error');
    }
  }, [buildPayload, scoreTitle, showToast]);

  const handleDownloadMidi = useCallback(() => {
    try {
      const payload = buildPayload();
      const bytes = scoreJsonToMidiBytes(payload, { ppq: 480 });
      const filename = `${slugifyFilename(scoreTitle || payload.meta?.title || 'score')}.mid`;
      downloadBinaryFile(filename, bytes, 'audio/midi');
      showToast?.(`已下載 MIDI：${filename}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('下載 MIDI 失敗', 'error');
    }
  }, [buildPayload, scoreTitle, showToast]);

  const handleClearCurrentScore = useCallback(() => {
    setInputValue('');
    setAssistantPrompt('');
    setMusicXmlImportStatus('已清除目前譜面');
    setMidiImportStatus('尚未匯入 MIDI');
    onClearCurrentScore?.();
    showToast?.('已清除目前譜面並釋放大型內容', 'success');
  }, [onClearCurrentScore, showToast]);

  const handleMidiImport = useCallback(async (file) => {
    if (!file || !confirmLargeFile(file)) {
      return;
    }

    setIsImportingMidi(true);
    setMidiImportStatus(`匯入中：${file.name}`);

    try {
      const payload = await parseMidiToV2(file, {
        bpm,
        timeSigNum,
        timeSigDen,
        tone: audioConfig?.tone,
        globalKeyOffset: audioConfig?.globalKeyOffset,
        reverb: audioConfig?.reverb,
        scaleMode: audioConfig?.scaleMode,
        accidentals,
      });
      const importedCount = payload.tracks.reduce(
        (count, track) => count + (track.events?.length ?? 0),
        0,
      );
      onLoadLocalScore?.(payload);
      setInputValue(JSON.stringify(payload, null, 2));
      setMidiImportStatus(`${payload.meta.title}，${importedCount} 個事件，PPQ ${payload.transport.resolution}`);
      showToast?.(`已匯入 MIDI：${payload.meta.title}`, 'success');
    } catch (error) {
      console.error(error);
      setMidiImportStatus(file.name);
      showToast?.('MIDI 匯入失敗', 'error');
    } finally {
      setIsImportingMidi(false);
    }
  }, [
    accidentals,
    audioConfig?.globalKeyOffset,
    audioConfig?.reverb,
    audioConfig?.scaleMode,
    audioConfig?.tone,
    bpm,
    confirmLargeFile,
    onLoadLocalScore,
    showToast,
    timeSigDen,
    timeSigNum,
  ]);

  const handleMidiFileChange = useCallback(async (event) => {
    const [file] = Array.from(event.target.files || []);
    try {
      await handleMidiImport(file);
    } finally {
      event.target.value = '';
    }
  }, [handleMidiImport]);

  const handleMusicXmlImport = useCallback(async (file) => {
    if (!file || !confirmLargeFile(file)) {
      return;
    }

    if (file.name.toLowerCase().endsWith('.mxl')) {
      showToast?.('目前支援未壓縮的 .musicxml / .xml，請先解壓縮 .mxl 後再匯入。', 'error');
      return;
    }

    setIsImportingMusicXml(true);
    setMusicXmlImportStatus(`解析中：${file.name}`);

    try {
      const xmlText = await file.text();
      const payload = convertMusicXmlToSlim(xmlText, {
        fileName: file.name,
        title: scoreTitle.trim() || undefined,
        bpm,
        timeSigNum,
        timeSigDen,
        tone: audioConfig?.tone,
        globalKeyOffset: audioConfig?.globalKeyOffset,
        reverb: audioConfig?.reverb,
        scaleMode: audioConfig?.scaleMode,
        accidentals,
      });
      const noteCount = Array.isArray(payload.notes) ? payload.notes.length : 0;

      setInputValue(JSON.stringify(payload, null, 2));
      onLoadLocalScore?.(payload);
      setMusicXmlImportStatus(`${payload.meta.title}，${noteCount} 個音符，已套用到播放器`);
      showToast?.(`MusicXML 已轉換：${payload.meta.title}`, 'success');
    } catch (error) {
      console.error(error);
      setMusicXmlImportStatus(file.name);
      showToast?.(error?.message || 'MusicXML 轉換失敗', 'error');
    } finally {
      setIsImportingMusicXml(false);
    }
  }, [
    accidentals,
    audioConfig?.globalKeyOffset,
    audioConfig?.reverb,
    audioConfig?.scaleMode,
    audioConfig?.tone,
    bpm,
    confirmLargeFile,
    onLoadLocalScore,
    scoreTitle,
    showToast,
    timeSigDen,
    timeSigNum,
  ]);

  const handleMusicXmlFileChange = useCallback(async (event) => {
    const [file] = Array.from(event.target.files || []);
    try {
      await handleMusicXmlImport(file);
    } finally {
      event.target.value = '';
    }
  }, [handleMusicXmlImport]);

  const handleMusicXmlDrop = useCallback(async (event) => {
    event.preventDefault();
    setIsDraggingMusicXml(false);
    const [file] = Array.from(event.dataTransfer?.files || []);
    await handleMusicXmlImport(file);
  }, [handleMusicXmlImport]);

  const handleMusicXmlDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDraggingMusicXml(true);
  }, []);

  const handleMusicXmlDragLeave = useCallback((event) => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsDraggingMusicXml(false);
    }
  }, []);

  const manualInputTypeLabel = externalInputType === EXTERNAL_INPUT_TYPES.JIANPU
    ? '簡譜 / 文字譜'
    : externalInputType === EXTERNAL_INPUT_TYPES.STAFF
      ? '五線譜文字'
      : '混合格式';

  return (
    <section className="rounded-[32px] border border-amber-300/15 bg-amber-500/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/55">
            Score Converter
          </div>
          <div className="text-sm font-semibold text-amber-50/90">
            以 MusicXML 上傳為主，手動與 AI 工具收在進階面板。
          </div>
          <div className="text-xs leading-relaxed text-white/45">
            支援未壓縮的 .musicxml 與 .xml。轉換後會直接載入目前播放器，下載請使用下方「下載當前譜面」。
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge label="目前狀態" value={isImportingMusicXml ? 'MusicXML 載入中' : musicXmlImportStatus} />
          <StatusBadge label="格式" value={aiOutputFormat === OUTPUT_FORMATS.JSON_V2 ? 'JSON V2' : aiOutputFormat} />
          <StatusBadge label="手動輸入" value={manualInputTypeLabel} />
          <StatusBadge label="MIDI" value={isImportingMidi ? '匯入中' : midiImportStatus} />
        </div>

        <div
          onDrop={handleMusicXmlDrop}
          onDragOver={handleMusicXmlDragOver}
          onDragLeave={handleMusicXmlDragLeave}
          className={[
            'rounded-[28px] border border-dashed p-5 transition-colors',
            isDraggingMusicXml
              ? 'border-emerald-300/60 bg-emerald-500/12'
              : 'border-emerald-300/25 bg-emerald-500/[0.06]',
          ].join(' ')}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/60">MusicXML Upload</div>
              <div className="mt-2 text-sm font-semibold text-emerald-50">上傳 .musicxml / .xml</div>
              <div className="mt-1 text-xs leading-relaxed text-white/50">
                選擇或拖曳檔案後會先檢查大小；超過 5 MB 會要求確認，避免瀏覽器因大檔卡住。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => musicXmlInputRef.current?.click()}
                disabled={isImportingMusicXml}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-500/15 px-4 py-2 text-xs font-bold tracking-[0.16em] text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <FileUp size={14} />
                {isImportingMusicXml ? '轉換中' : '上傳 MusicXML'}
              </button>
              <button
                type="button"
                onClick={handleClearCurrentScore}
                className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-500/12 px-4 py-2 text-xs font-bold tracking-[0.16em] text-rose-100 transition-colors hover:bg-rose-500/20"
              >
                <Trash2 size={14} />
                清除目前譜面
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={handleSyncCurrent}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-amber-100/85 transition-colors hover:bg-white/10"
          >
            <RefreshCcw size={14} />
            同步目前譜面
          </button>
          <button
            type="button"
            onClick={handleLoadToEditor}
            className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-sky-100 transition-colors hover:bg-sky-500/18"
          >
            <ArrowDownUp size={14} />
            載入播放器
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            title={settingsHint}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-emerald-100 transition-colors hover:bg-emerald-500/18"
          >
            <Download size={14} />
            下載當前譜面
          </button>
          <button
            type="button"
            onClick={handleDownloadMidi}
            className="flex items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-violet-100 transition-colors hover:bg-violet-500/18"
          >
            <Music2 size={14} />
            下載 MIDI
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.06] px-4 py-3 text-xs leading-relaxed text-emerald-50/75">
          <AlertTriangle className="mt-0.5 shrink-0 text-emerald-200/75" size={15} />
          <span>{settingsHint}，以及目前音色與升降記號設定。</span>
        </div>

        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">MIDI Import</div>
              <div className="mt-2 text-xs leading-relaxed text-white/45">
                MIDI 匯入仍可直接轉成 JSON 並載入播放器；大檔同樣會先跳出確認。
              </div>
            </div>
            <button
              type="button"
              onClick={() => midiInputRef.current?.click()}
              disabled={isImportingMidi}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold tracking-[0.16em] text-white/75 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <FileUp size={14} />
              {isImportingMidi ? '匯入中' : '匯入 MIDI'}
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">Advanced / Debug</span>
              <span className="mt-1 block text-xs text-white/55">手動輸入、AI 提示詞與除錯工具</span>
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-amber-100/70 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isAdvancedOpen ? (
            <div className="space-y-4 border-t border-white/10 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/70">
                  <div className="mb-2 font-black uppercase tracking-[0.22em] text-amber-200/45">外部譜面類型</div>
                  <select
                    value={externalInputType}
                    onChange={(event) => setExternalInputType(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value={EXTERNAL_INPUT_TYPES.JIANPU}>簡譜 / 文字譜</option>
                    <option value={EXTERNAL_INPUT_TYPES.STAFF}>五線譜文字</option>
                    <option value={EXTERNAL_INPUT_TYPES.MIXED}>混合格式</option>
                  </select>
                </label>
                <label className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/70">
                  <div className="mb-2 font-black uppercase tracking-[0.22em] text-amber-200/45">AI 輸出格式</div>
                  <select
                    value={aiOutputFormat}
                    onChange={(event) => setAiOutputFormat(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value={OUTPUT_FORMATS.JSON_V2}>JSON V2</option>
                    <option value={OUTPUT_FORMATS.NUMBERED_GRID}>Numbered Grid</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">手動輸入內容</div>
                <textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  className="min-h-[180px] w-full rounded-[24px] border border-white/10 bg-black/30 px-4 py-4 text-sm leading-relaxed text-white outline-none"
                  placeholder={`貼上簡譜、文字譜或 JSON，再載入到 ${APP_NAME}`}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-bold tracking-[0.16em] text-amber-100 transition-colors hover:bg-amber-500/18"
                >
                  <Copy size={14} />
                  複製 AI 提示詞
                </button>
                <button
                  type="button"
                  onClick={() => refreshAssistantPrompt()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold tracking-[0.16em] text-white/75 transition-colors hover:bg-white/10"
                >
                  <Wand2 size={14} />
                  重新產生提示詞
                </button>
              </div>

              <label className="block">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">AI 轉換提示詞預覽</div>
                <textarea
                  readOnly
                  value={assistantPrompt}
                  className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-black/25 px-4 py-4 text-xs leading-relaxed text-white/75 outline-none"
                  placeholder="展開進階工具後會在這裡產生提示詞"
                />
              </label>
            </div>
          ) : null}
        </div>

        <input
          ref={midiInputRef}
          type="file"
          accept=".mid,.midi,audio/midi"
          className="hidden"
          onChange={handleMidiFileChange}
        />
        <input
          ref={musicXmlInputRef}
          type="file"
          accept=".musicxml,.xml,application/xml,text/xml"
          className="hidden"
          onChange={handleMusicXmlFileChange}
        />
      </div>
    </section>
  );
});

export default ScoreConverter;
