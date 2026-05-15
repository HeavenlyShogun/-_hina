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
    setConvertedResults([]);
    onClearCurrentScore?.();
    showToast?.('已清除目前譜面與批次轉換記錄', 'success');
  }, [onClearCurrentScore, showToast]);

  const handleMidiImport = useCallback(async (file) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
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
      const payload = await handleMidiImport(file);
      if (payload) {
        results.push({ file, payload });
      }
    }
    
    if (results.length > 0) {
      setConvertedResults(prev => [...prev, ...results]);
    }
    event.target.value = '';
  }, [handleMidiImport]);

  const handleMusicXmlImport = useCallback(async (file) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
    }

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

      setInputValue(JSON.stringify(payload, null, 2));
      onLoadLocalScore?.(payload);
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
      const payload = await handleMusicXmlImport(file);
      if (payload) {
        results.push({ file, payload });
      }
    }

    if (results.length > 0) {
      setConvertedResults(prev => [...prev, ...results]);
    }
    event.target.value = '';
  }, [handleMusicXmlImport]);

  const handleMusicXmlDrop = useCallback(async (event) => {
    event.preventDefault();
    setIsDraggingMusicXml(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;

    const results = [];
    for (const file of files) {
      const payload = await handleMusicXmlImport(file);
      if (payload) {
        results.push({ file, payload });
      }
    }

    if (results.length > 0) {
      setConvertedResults(prev => [...prev, ...results]);
    }
  }, [handleMusicXmlImport]);

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
        {/* ... rest of return ... */}
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
