import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  Copy,
  FileUp,
  Music2,
  Trash2,
  Wand2,
} from 'lucide-react';
import { normalizeScoreSource } from '../utils/score';
import { parseMidiToV2 } from '../utils/midiToV2';
import { convertMusicXmlToSlim } from '../utils/musicXmlToSlim';
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
  onBatchUpload,
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
  const [convertedResults, setConvertedResults] = useState([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);

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

  const handleLoadToEditor = useCallback((payloadOverride = null, options = {}) => {
    try {
      const payload = payloadOverride ?? buildPayload();
      onLoadLocalScore?.(payload, options);
      setInputValue(JSON.stringify(payload, null, 2));
      showToast?.(
        options.mode === 'append'
          ? `已接到譜面後面：${payload.meta?.title ?? scoreTitle}`
          : `已覆蓋到譜面編輯：${payload.meta?.title ?? scoreTitle}`,
        'success',
      );
    } catch (error) {
      console.error(error);
      showToast?.('同步到譜面編輯失敗', 'error');
    }
  }, [buildPayload, onLoadLocalScore, scoreTitle, showToast]);

  const handleClearCurrentScore = useCallback(() => {
    setInputValue('');
    setAssistantPrompt('');
    setMusicXmlImportStatus('已清除目前譜面');
    setMidiImportStatus('尚未匯入 MIDI');
    setConvertedResults([]);
    onClearCurrentScore?.();
    showToast?.('已清除目前譜面與批次轉換記錄', 'success');
  }, [onClearCurrentScore, showToast]);

  const handleMidiImport = useCallback(async (file, options = {}) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
    }

    const { shouldLoadToEditor = true, shouldSyncInput = true } = options;
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
      if (shouldLoadToEditor) {
        onLoadLocalScore?.(payload);
      }
      if (shouldSyncInput) {
        setInputValue(JSON.stringify(payload, null, 2));
      }
      setMidiImportStatus(`${payload.meta.title}，${importedCount} 個事件，PPQ ${payload.transport.resolution}`);
      showToast?.(`已匯入 MIDI：${payload.meta.title}`, 'success');
      return payload;
    } catch (error) {
      console.error(error);
      setMidiImportStatus(file.name);
      showToast?.('MIDI 匯入失敗', 'error');
      return null;
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
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const results = [];
    for (const file of files) {
      const payload = await handleMidiImport(file, {
        shouldLoadToEditor: files.length === 1,
        shouldSyncInput: files.length === 1,
      });
      if (payload) {
        results.push({ file, payload });
      }
    }

    if (results.length > 0) {
      setConvertedResults((prev) => [...prev, ...results]);
      if (results.length > 1) {
        setMidiImportStatus(`已讀取 ${results.length} 份 MIDI，請從右側清單選擇載入`);
        showToast?.(`已讀取 ${results.length} 份 MIDI`, 'success');
      }
    }
    event.target.value = '';
  }, [handleMidiImport, showToast]);

  const handleMusicXmlImport = useCallback(async (file, options = {}) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
    }

    const { shouldLoadToEditor = true, shouldSyncInput = true } = options;
    if (file.name.toLowerCase().endsWith('.mxl')) {
      showToast?.('目前支援未壓縮的 .musicxml / .xml，請先解壓縮 .mxl 後再匯入。', 'error');
      return null;
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

      if (shouldSyncInput) {
        setInputValue(JSON.stringify(payload, null, 2));
      }
      if (shouldLoadToEditor) {
        onLoadLocalScore?.(payload);
      }
      setMusicXmlImportStatus(`${payload.meta.title}，${noteCount} 個音符，已套用到播放器`);
      showToast?.(`MusicXML 已轉換：${payload.meta.title}`, 'success');
      return payload;
    } catch (error) {
      console.error(error);
      setMusicXmlImportStatus(file.name);
      showToast?.(error?.message || 'MusicXML 轉換失敗', 'error');
      return null;
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
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const results = [];
    for (const file of files) {
      const payload = await handleMusicXmlImport(file, {
        shouldLoadToEditor: files.length === 1,
        shouldSyncInput: files.length === 1,
      });
      if (payload) {
        results.push({ file, payload });
      }
    }

    if (results.length > 0) {
      setConvertedResults((prev) => [...prev, ...results]);
      if (results.length > 1) {
        setMusicXmlImportStatus(`已讀取 ${results.length} 份 MusicXML，請從右側清單選擇載入`);
        showToast?.(`已讀取 ${results.length} 份 MusicXML`, 'success');
      }
    }
    event.target.value = '';
  }, [handleMusicXmlImport, showToast]);

  const handleMusicXmlDrop = useCallback(async (event) => {
    event.preventDefault();
    setIsDraggingMusicXml(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;

    const results = [];
    for (const file of files) {
      const payload = await handleMusicXmlImport(file, {
        shouldLoadToEditor: files.length === 1,
        shouldSyncInput: files.length === 1,
      });
      if (payload) {
        results.push({ file, payload });
      }
    }

    if (results.length > 0) {
      setConvertedResults((prev) => [...prev, ...results]);
      if (results.length > 1) {
        setMusicXmlImportStatus(`已讀取 ${results.length} 份 MusicXML，請從右側清單選擇載入`);
        showToast?.(`已讀取 ${results.length} 份 MusicXML`, 'success');
      }
    }
  }, [handleMusicXmlImport, showToast]);

  const handleRemoveResult = useCallback((index) => {
    setConvertedResults(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleBatchUpload = useCallback(async () => {
    if (!convertedResults.length || !onBatchUpload) return;
    setIsBatchUploading(true);
    try {
      const payloads = convertedResults.map(res => ({
        title: res.payload.meta?.title || res.file.name,
        payload: res.payload
      }));
      const success = await onBatchUpload(payloads);
      if (success) {
        setConvertedResults([]);
        showToast?.(`成功上傳 ${payloads.length} 份譜面至雲端`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast?.('批次上傳失敗', 'error');
    } finally {
      setIsBatchUploading(false);
    }
  }, [convertedResults, onBatchUpload, showToast]);

  const manualInputTypeLabel = externalInputType === EXTERNAL_INPUT_TYPES.JIANPU
    ? '簡譜 / 文字譜'
    : externalInputType === EXTERNAL_INPUT_TYPES.STAFF
      ? '五線譜文字'
      : '混合格式';

  return (
    <section className="rounded-[32px] border border-amber-300/15 bg-amber-500/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200/60">
              <Music2 size={15} />
              Batch Converter
            </div>
            <p className="max-w-2xl text-sm text-amber-50/80">
              可一次選擇多個 MIDI 或 MusicXML 檔案，逐份轉換後加入待上傳清單。每次批次上傳都會產生新的雲端 id，不會覆蓋既有譜面。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => midiInputRef.current?.click()}
              disabled={isImportingMidi || isImportingMusicXml}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <FileUp size={15} />
              選擇多個 MIDI
            </button>
            <button
              type="button"
              onClick={() => musicXmlInputRef.current?.click()}
              disabled={isImportingMidi || isImportingMusicXml}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Music2 size={15} />
              選擇多個 MusicXML
            </button>
            <button
              type="button"
              onClick={handleBatchUpload}
              disabled={!convertedResults.length || isBatchUploading}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <ArrowDownUp size={15} />
              {isBatchUploading ? '批次上傳中...' : `上傳本批 ${convertedResults.length} 份譜面`}
            </button>
            <button
              type="button"
              onClick={handleClearCurrentScore}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/20"
            >
              <Trash2 size={15} />
              清除本批
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge label="MIDI" value={midiImportStatus} />
          <StatusBadge label="MusicXML" value={musicXmlImportStatus} />
          <StatusBadge label="Grid" value={`1/${charResolution}`} />
          <StatusBadge label="Type" value={manualInputTypeLabel} />
        </div>

        <div
          className={`rounded-[24px] border border-dashed px-4 py-5 text-sm transition ${
            isDraggingMusicXml
              ? 'border-amber-200 bg-amber-400/10 text-amber-50'
              : 'border-white/15 bg-black/15 text-amber-50/75'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingMusicXml(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDraggingMusicXml(false);
          }}
          onDrop={handleMusicXmlDrop}
        >
          可直接把多個 `.musicxml` / `.xml` 檔拖曳到這裡。若要分批上傳，上一批成功後待上傳清單會自動清空。
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/55">Pending Uploads</div>
                <div className="mt-1 text-xs text-amber-50/55">本批待上傳清單。可先逐筆載入到譜面編輯，成功上傳後會自動清空。</div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-amber-50/70">
                {convertedResults.length} items
              </span>
            </div>

            <div className="custom-scrollbar max-h-[220px] space-y-2 overflow-y-auto pr-1">
              {convertedResults.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-amber-50/45">
                  尚未加入待上傳的轉換結果。一次選多檔後會先集中列在這裡。
                </div>
              ) : convertedResults.map((result, index) => (
                <div key={`${result.file.name}-${index}`} className="flex items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-amber-50">
                      {result.payload?.meta?.title || result.file.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-amber-50/55">
                      {result.file.name} · {formatBytes(result.file.size)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadToEditor(result.payload, { mode: 'replace' })}
                      className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-2 text-emerald-100 hover:bg-emerald-500/20"
                      title="覆蓋到譜面編輯"
                    >
                      <Wand2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadToEditor(result.payload, { mode: 'append' })}
                      className="rounded-xl border border-sky-300/20 bg-sky-500/10 p-2 text-sky-100 hover:bg-sky-500/20"
                      title="接到目前譜面後面"
                    >
                      <ArrowDownUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveResult(index)}
                      className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-2 text-rose-100 hover:bg-rose-500/20"
                      title="移除此項"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((open) => !open)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-amber-100/75"
            >
              <ChevronDown size={14} className={`transition ${isAdvancedOpen ? 'rotate-180' : ''}`} />
              AI 輔助轉換
            </button>

            {isAdvancedOpen ? (
              <div className="mt-3 space-y-3 rounded-[18px] border border-white/10 bg-black/25 p-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/55">Source Draft</div>
                  <div className="mt-1 text-xs text-amber-50/55">貼入簡譜、五線譜描述或 JSON 後，可直接覆蓋到譜面編輯，或產生符合目前譜面系統的 AI 提示詞。</div>
                </div>
                <textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  spellCheck={false}
                  className="custom-scrollbar min-h-[220px] w-full rounded-[18px] border border-white/10 bg-black/30 p-4 font-mono text-xs leading-relaxed text-amber-50/80 outline-none"
                  placeholder="貼上簡譜、JSON、外部轉譜結果，或 AI 要參考的草稿。"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadToEditor(null, { mode: 'replace' })}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-amber-50/80 hover:bg-white/10"
                  >
                    <Wand2 size={14} />
                    覆蓋到譜面編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadToEditor(null, { mode: 'append' })}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-50/90 hover:bg-emerald-500/20"
                  >
                    <Wand2 size={14} />
                    接到後面
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    [EXTERNAL_INPUT_TYPES.JIANPU, '簡譜'],
                    [EXTERNAL_INPUT_TYPES.STAFF, '五線譜'],
                    [EXTERNAL_INPUT_TYPES.MIXED, '混合'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setExternalInputType(value)}
                      className={`rounded-full px-3 py-1 text-xs ${externalInputType === value ? 'bg-amber-400/20 text-amber-50' : 'bg-white/5 text-amber-50/60'}`}
                    >
                      {label}
                    </button>
                  ))}
                  {[
                    [OUTPUT_FORMATS.JSON_V2, 'JSON V2'],
                    [OUTPUT_FORMATS.NUMBERED_GRID, 'Numbered Grid'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAiOutputFormat(value)}
                      className={`rounded-full px-3 py-1 text-xs ${aiOutputFormat === value ? 'bg-emerald-400/20 text-emerald-50' : 'bg-white/5 text-amber-50/60'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => refreshAssistantPrompt()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-amber-50/80 hover:bg-white/10">
                    <Wand2 size={14} />
                    產生提示詞
                  </button>
                  <button type="button" onClick={handleCopyPrompt} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-amber-50/80 hover:bg-white/10">
                    <Copy size={14} />
                    複製
                  </button>
                </div>
                <textarea
                  value={assistantPrompt}
                  readOnly
                  spellCheck={false}
                  className="custom-scrollbar min-h-[140px] w-full rounded-[18px] border border-white/10 bg-black/30 p-3 font-mono text-xs leading-relaxed text-amber-50/75 outline-none"
                  placeholder={`按下「產生提示詞」後，這裡會出現給 ${APP_NAME} 使用的轉譜提示詞。`}
                />
              </div>
            ) : null}
          </div>
        </div>

        <input
          ref={midiInputRef}
          type="file"
          multiple
          accept=".mid,.midi,audio/midi"
          className="hidden"
          onChange={handleMidiFileChange}
        />
        <input
          ref={musicXmlInputRef}
          type="file"
          multiple
          accept=".musicxml,.xml,application/xml,text/xml"
          className="hidden"
          onChange={handleMusicXmlFileChange}
        />
      </div>
    </section>
  );
});

export default ScoreConverter;
