import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Copy, Download, FileUp, Music2, RefreshCcw, Wand2 } from 'lucide-react';
import { normalizeScoreSource } from '../utils/score';
import { parseMidiToV2 } from '../utils/midiToV2';
import { convertMusicXmlToSlim } from '../utils/musicXmlToSlim';
import { scoreJsonToMidiBytes } from '../utils/scoreToMidi';
import { APP_NAME, DEFAULT_SCORE_NAME } from '../config/branding';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
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

function slugifyFilename(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
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
      bpm: Number(transport.bpm) || playbackConfig.bpm,
      timeSigNum: Number(transport.timeSigNum) || playbackConfig.timeSigNum,
      timeSigDen: Number(transport.timeSigDen) || playbackConfig.timeSigDen,
      resolution: Number(transport.resolution) || 480,
    },
    playback: {
      tone: playback.tone ?? playbackConfig.tone,
      globalKeyOffset: Number(playback.globalKeyOffset ?? playbackConfig.globalKeyOffset) || 0,
      reverb: playback.reverb ?? playbackConfig.reverb,
      scaleMode: playback.scaleMode ?? playbackConfig.scaleMode,
      accidentals:
        playback.accidentals && typeof playback.accidentals === 'object'
          ? playback.accidentals
          : playbackConfig.accidentals,
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
}) => {
  const midiInputRef = useRef(null);
  const musicXmlInputRef = useRef(null);
  const [inputValue, setInputValue] = useState(scoreDocument.rawText ?? '');
  const [externalInputType, setExternalInputType] = useState(EXTERNAL_INPUT_TYPES.JIANPU);
  const [aiOutputFormat, setAiOutputFormat] = useState(OUTPUT_FORMATS.JSON_V2);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [midiImportStatus, setMidiImportStatus] = useState('尚未匯入 MIDI');
  const [isImportingMidi, setIsImportingMidi] = useState(false);
  const [musicXmlImportStatus, setMusicXmlImportStatus] = useState('尚未匯入 MusicXML');
  const [isImportingMusicXml, setIsImportingMusicXml] = useState(false);
  const [convertedMusicXmlPayload, setConvertedMusicXmlPayload] = useState(null);
  const [isDraggingMusicXml, setIsDraggingMusicXml] = useState(false);

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
    refreshAssistantPrompt();
  }, [refreshAssistantPrompt]);

  const buildPayload = useCallback(() => {
    const maybeJsonScore = tryParseJsonScoreText(inputValue);

    if (maybeJsonScore) {
      return ensurePayloadMetadata(maybeJsonScore, {
        title: scoreTitle.trim() || DEFAULT_SCORE_NAME,
        playbackConfig,
        references,
        referenceNotes,
        rawText: inputValue,
      });
    }

    const normalized = normalizeScoreSource(inputValue, playbackConfig);
    return createJsonScoreSchema({
      title: scoreTitle.trim() || DEFAULT_SCORE_NAME,
      rawText: inputValue,
      sourceType: SCORE_SOURCE_TYPES.TEXT,
      playbackConfig,
      normalized,
      references,
      referenceNotes,
    });
  }, [inputValue, playbackConfig, referenceNotes, references, scoreTitle]);

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
      showToast?.('已複製 AI 轉換提示詞', 'success');
    } catch (error) {
      console.error(error);
      showToast?.('複製提示詞失敗', 'error');
    }
  }, [refreshAssistantPrompt, showToast]);

  const handleLoadToEditor = useCallback(() => {
    try {
      const payload = buildPayload();
      onLoadLocalScore?.(payload);
      showToast?.(`已載入轉換草稿：${payload.meta?.title ?? scoreTitle}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('載入轉換草稿失敗', 'error');
    }
  }, [buildPayload, onLoadLocalScore, scoreTitle, showToast]);

  const handleDownloadJson = useCallback(() => {
    try {
      const payload = buildPayload();
      const filename = `${slugifyFilename(scoreTitle || 'score')}-converted.json`;
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

  const handleMidiImport = useCallback(async (file) => {
    if (!file) {
      return;
    }

    setIsImportingMidi(true);
    setMidiImportStatus(`正在匯入 ${file.name}...`);

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
      setMidiImportStatus(`${payload.meta.title}，共 ${importedCount} 個事件，PPQ ${payload.transport.resolution}`);
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
    if (!file) {
      return;
    }

    if (file.name.toLowerCase().endsWith('.mxl')) {
      showToast?.('目前前端支援未壓縮 .musicxml/.xml；.mxl 請先解壓後再匯入。', 'error');
      return;
    }

    setIsImportingMusicXml(true);
    setMusicXmlImportStatus(`正在轉換 ${file.name}...`);

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

      setConvertedMusicXmlPayload(payload);
      setInputValue(JSON.stringify(payload, null, 2));
      onLoadLocalScore?.(payload);
      setMusicXmlImportStatus(`${payload.meta.title}，${noteCount} 個音符，已套用到播放預覽`);
      showToast?.(`MusicXML 已轉換並載入：${payload.meta.title}`, 'success');
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

  const handleDownloadConvertedMusicXml = useCallback(() => {
    if (!convertedMusicXmlPayload) {
      showToast?.('請先匯入 MusicXML 檔案。', 'error');
      return;
    }

    const filename = `${slugifyFilename(convertedMusicXmlPayload.meta?.title || scoreTitle || 'musicxml-score')}-slim.json`;
    downloadJsonFile(filename, convertedMusicXmlPayload);
    showToast?.(`已下載 ${filename}`, 'success');
  }, [convertedMusicXmlPayload, scoreTitle, showToast]);

  return (
    <section className="rounded-[32px] border border-amber-300/15 bg-amber-500/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/55">
            Score Converter
          </div>
          <div className="text-sm font-semibold text-amber-50/90">
            上傳 MusicXML 並轉換成可播放譜面
          </div>
          <div className="text-xs leading-relaxed text-white/45">
            支援未壓縮的 .musicxml 與 .xml，轉換後會直接載入目前播放器，也可以下載 slim JSON 保存。
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">輸入來源</div>
            <div className="mt-2 text-sm font-semibold text-amber-50">
              {externalInputType === EXTERNAL_INPUT_TYPES.JIANPU ? '簡譜 / 自定義文字' : externalInputType === EXTERNAL_INPUT_TYPES.STAFF ? '五線譜描述' : '混合稿'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">輸出目標</div>
            <div className="mt-2 text-sm font-semibold text-amber-50">
              {aiOutputFormat === OUTPUT_FORMATS.JSON_V2 ? 'JSON V2 主格式' : aiOutputFormat}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">MIDI 匯入</div>
            <div className="mt-2 text-sm font-semibold text-amber-50">{midiImportStatus}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/25 p-4 lg:col-span-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">MusicXML 轉換</div>
            <div className="mt-2 text-sm font-semibold text-amber-50">{musicXmlImportStatus}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/70">
            <div className="mb-2 font-black uppercase tracking-[0.22em] text-amber-200/45">外部譜面類型</div>
            <select
              value={externalInputType}
              onChange={(event) => setExternalInputType(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
            >
              <option value={EXTERNAL_INPUT_TYPES.JIANPU}>簡譜 / 文字譜</option>
              <option value={EXTERNAL_INPUT_TYPES.STAFF}>五線譜描述</option>
              <option value={EXTERNAL_INPUT_TYPES.MIXED}>混合草稿</option>
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
                可拖放檔案到這裡，或使用按鈕選取檔案。壓縮的 .mxl 目前需要先解壓縮。
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
                onClick={handleDownloadConvertedMusicXml}
                disabled={!convertedMusicXmlPayload}
                className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-xs font-bold tracking-[0.16em] text-sky-100 transition-colors hover:bg-sky-500/18 disabled:opacity-50"
              >
                <Download size={14} />
                下載 slim JSON
              </button>
            </div>
          </div>
        </div>

        <label className="block">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">轉換草稿</div>
          <textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            className="min-h-[220px] w-full rounded-[24px] border border-white/10 bg-black/30 px-4 py-4 text-sm leading-relaxed text-white outline-none"
            placeholder={`在這裡貼上外部譜面內容，之後可逐步接上 ${APP_NAME} 的正式轉換流程。`}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            onClick={handleCopyPrompt}
            className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-amber-100 transition-colors hover:bg-amber-500/18"
          >
            <Copy size={14} />
            複製提示詞
          </button>
          <button
            type="button"
            onClick={handleLoadToEditor}
            className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-sky-100 transition-colors hover:bg-sky-500/18"
          >
            <ArrowDownUp size={14} />
            載入編輯器
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-[11px] font-black tracking-[0.18em] text-emerald-100 transition-colors hover:bg-emerald-500/18"
          >
            <Download size={14} />
            下載 JSON
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

        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">其他轉換工具</div>
              <div className="mt-2 text-xs leading-relaxed text-white/45">
                需要手動整理譜面時，可使用 AI 提示詞、MIDI 匯入或從草稿產生 JSON。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => midiInputRef.current?.click()}
                disabled={isImportingMidi}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold tracking-[0.16em] text-white/75 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <FileUp size={14} />
                {isImportingMidi ? '匯入中' : '匯入 MIDI'}
              </button>
              <button
                type="button"
                onClick={() => refreshAssistantPrompt()}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold tracking-[0.16em] text-white/75 transition-colors hover:bg-white/10"
              >
                <Wand2 size={14} />
                更新提示詞
              </button>
            </div>
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

        <label className="block">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/45">AI 轉換提示詞預覽</div>
          <textarea
            readOnly
            value={assistantPrompt}
            className="min-h-[180px] w-full rounded-[24px] border border-white/10 bg-black/25 px-4 py-4 text-xs leading-relaxed text-white/75 outline-none"
          />
        </label>
      </div>
    </section>
  );
});

export default ScoreConverter;
