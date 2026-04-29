import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FileUp, HardDriveDownload, RefreshCcw, Sparkles, Upload, Wand2 } from 'lucide-react';
import { normalizeScoreSource } from '../utils/score';
import { parseMidiToV2 } from '../utils/midiToV2';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import {
  buildAiConversionPrompt,
  normalizeExternalNotationDraft,
  tryParseJsonScoreText,
} from '../utils/scoreConversionAssist';

const LOCAL_STORAGE_KEY = 'project-hina:local-converted-scores';
const EXTERNAL_INPUT_TYPES = {
  JIANPU: 'jianpu',
  STAFF: 'staff',
  MIXED: 'mixed',
};
const OUTPUT_FORMATS = {
  LEGACY_TEXT: 'legacy-text',
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
      title: title || 'Untitled Score',
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
        events: normalized.events.map((event) => ({
          type: event.isRest ? 'rest' : 'note',
          tick: event.tick,
          duration: event.durationTick ?? event.durationTicks,
          key: event.k ?? null,
          velocity: Number((event.v ?? 0.85).toFixed(4)),
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
      resolution: Number(transport.resolution) || 96,
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

function readLocalSavedScores() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const [inputValue, setInputValue] = useState(scoreDocument.rawText ?? '');
  const [lastConverted, setLastConverted] = useState(null);
  const [savedCount, setSavedCount] = useState(0);
  const [savedScores, setSavedScores] = useState([]);
  const [midiImportStatus, setMidiImportStatus] = useState('No MIDI imported yet');
  const [isImportingMidi, setIsImportingMidi] = useState(false);
  const [externalInputType, setExternalInputType] = useState(EXTERNAL_INPUT_TYPES.JIANPU);
  const [aiOutputFormat, setAiOutputFormat] = useState(OUTPUT_FORMATS.LEGACY_TEXT);
  const [assistantPrompt, setAssistantPrompt] = useState('');

  useEffect(() => {
    if (scoreDocument.sourceType === SCORE_SOURCE_TYPES.TEXT) {
      setInputValue(scoreDocument.rawText ?? '');
    }
  }, [scoreDocument.rawText, scoreDocument.sourceType]);

  useEffect(() => {
    const nextSaved = readLocalSavedScores();
    setSavedScores(nextSaved);
    setSavedCount(nextSaved.length);
  }, []);

  const playbackConfig = useMemo(() => ({
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
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
    timeSigDen,
    timeSigNum,
  ]);

  const refreshAssistantPrompt = useCallback((nextInputValue = inputValue) => {
    const prompt = buildAiConversionPrompt({
      title: scoreTitle.trim() || 'Untitled Score',
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
      const normalizedJsonPayload = ensurePayloadMetadata(maybeJsonScore, {
        title: scoreTitle.trim() || 'Untitled Score',
        playbackConfig,
        references,
        referenceNotes,
        rawText: inputValue,
      });
      setLastConverted(normalizedJsonPayload);
      return normalizedJsonPayload;
    }

    const normalized = normalizeScoreSource(inputValue, playbackConfig);
    const payload = createJsonScoreSchema({
      title: scoreTitle.trim() || 'Untitled Score',
      rawText: inputValue,
      sourceType: SCORE_SOURCE_TYPES.TEXT,
      playbackConfig,
      normalized,
      references,
      referenceNotes,
    });

    setLastConverted(payload);
    return payload;
  }, [inputValue, playbackConfig, referenceNotes, references, scoreTitle]);

  const handleSyncCurrent = useCallback(() => {
    setInputValue(scoreDocument.rawText ?? '');
    refreshAssistantPrompt(scoreDocument.rawText ?? '');
    showToast?.('Converter synced from current score', 'success');
  }, [refreshAssistantPrompt, scoreDocument.rawText, showToast]);

  const handleFormatDraft = useCallback(() => {
    const formatted = normalizeExternalNotationDraft(inputValue);
    setInputValue(formatted);
    refreshAssistantPrompt(formatted);
    showToast?.('Draft formatting applied', 'success');
  }, [inputValue, refreshAssistantPrompt, showToast]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      const prompt = refreshAssistantPrompt();
      await window.navigator.clipboard.writeText(prompt);
      showToast?.('AI prompt copied', 'success');
    } catch (error) {
      console.error(error);
      showToast?.('Prompt copy failed', 'error');
    }
  }, [refreshAssistantPrompt, showToast]);

  const handleLoadToEditor = useCallback(() => {
    try {
      const payload = buildPayload();
      onLoadLocalScore?.(payload);
      showToast?.(`Loaded converted score: ${payload.meta?.title ?? scoreTitle}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('Load converted score failed', 'error');
    }
  }, [buildPayload, onLoadLocalScore, scoreTitle, showToast]);

  const handleDownload = useCallback(() => {
    try {
      const payload = buildPayload();
      const filename = `${slugifyFilename(scoreTitle || 'score')}-converted.json`;
      downloadJsonFile(filename, payload);
      showToast?.(`Downloaded ${filename}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('Convert failed', 'error');
    }
  }, [buildPayload, scoreTitle, showToast]);

  const savePayloadLocal = useCallback((payload, successMessage = 'Converted score saved locally') => {
    const next = readLocalSavedScores();
    next.unshift({
      id: payload.meta.id,
      title: payload.meta.title,
      savedAt: payload.meta.migratedAt,
      data: payload,
    });
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    setSavedScores(next);
    setSavedCount(next.length);
    setLastConverted(payload);
    showToast?.(successMessage, 'success');
  }, [showToast]);

  const handleSaveLocal = useCallback(() => {
    try {
      const payload = buildPayload();
      savePayloadLocal(payload);
    } catch (error) {
      console.error(error);
      showToast?.('Local save failed', 'error');
    }
  }, [buildPayload, savePayloadLocal, showToast]);

  const handleMidiImport = useCallback(async (file) => {
    if (!file) {
      return;
    }

    setIsImportingMidi(true);
    setMidiImportStatus(`Importing ${file.name}...`);

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

      savePayloadLocal(payload, `Imported MIDI: ${payload.meta.title}`);
      setMidiImportStatus(
        `${payload.meta.fileName} -> ${importedCount} notes @ PPQ ${payload.transport.resolution}`,
      );
    } catch (error) {
      console.error(error);
      setMidiImportStatus(file.name);
      showToast?.('MIDI import failed', 'error');
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
    savePayloadLocal,
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

  const handleLoadSaved = useCallback((saved) => {
    try {
      const payload = saved?.data;
      if (!payload || typeof payload !== 'object') {
        showToast?.('Saved payload is invalid', 'error');
        return;
      }

      onLoadLocalScore?.(payload);
      setLastConverted(payload);
      showToast?.(`Loaded local score: ${saved.title}`, 'success');
    } catch (error) {
      console.error(error);
      showToast?.('Local load failed', 'error');
    }
  }, [onLoadLocalScore, showToast]);

  return (
    <section className="mt-6 rounded-[32px] border border-amber-400/15 bg-amber-500/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-200/55">Local Converter</div>
            <div className="mt-1 text-sm font-semibold text-amber-50/90">Convert legacy text score into local JSON schema</div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/40">
            local saved: {savedCount}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <button
            type="button"
            onClick={handleSyncCurrent}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-amber-100/80 transition-colors hover:bg-white/10"
          >
            <RefreshCcw size={14} />
            SYNC CURRENT SCORE
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-amber-100 transition-colors hover:bg-amber-500/18"
          >
            <Download size={14} />
            DOWNLOAD JSON
          </button>
          <button
            type="button"
            onClick={handleSaveLocal}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-emerald-100 transition-colors hover:bg-emerald-500/18"
          >
            <HardDriveDownload size={14} />
            SAVE LOCAL
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <label className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/70">
            <div className="mb-2 font-black uppercase tracking-[0.22em] text-amber-200/45">Source Type</div>
            <select
              value={externalInputType}
              onChange={(event) => setExternalInputType(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-amber-50 outline-none"
            >
              <option value={EXTERNAL_INPUT_TYPES.JIANPU}>Jianpu / Numbered</option>
              <option value={EXTERNAL_INPUT_TYPES.STAFF}>Staff / Note Names</option>
              <option value={EXTERNAL_INPUT_TYPES.MIXED}>Mixed / Unknown</option>
            </select>
          </label>

          <label className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/70">
            <div className="mb-2 font-black uppercase tracking-[0.22em] text-amber-200/45">AI Output</div>
            <select
              value={aiOutputFormat}
              onChange={(event) => setAiOutputFormat(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-amber-50 outline-none"
            >
              <option value={OUTPUT_FORMATS.LEGACY_TEXT}>Legacy Text</option>
              <option value={OUTPUT_FORMATS.JSON_V2}>Project Hina JSON</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleFormatDraft}
            className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-sky-100 transition-colors hover:bg-sky-500/18"
          >
            <Sparkles size={14} />
            FORMAT DRAFT
          </button>

          <button
            type="button"
            onClick={handleCopyPrompt}
            className="flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-fuchsia-100 transition-colors hover:bg-fuchsia-500/18"
          >
            <Copy size={14} />
            COPY AI PROMPT
          </button>
        </div>

        <input
          ref={midiInputRef}
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          className="hidden"
          onChange={handleMidiFileChange}
        />

        <button
          type="button"
          onClick={() => midiInputRef.current?.click()}
          disabled={isImportingMidi}
          className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-sky-300/25 bg-sky-500/[0.06] px-4 py-5 text-center text-sky-50 transition-colors hover:bg-sky-500/[0.1] disabled:cursor-wait disabled:opacity-60"
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em]">
            <FileUp size={15} />
            {isImportingMidi ? 'Importing MIDI...' : 'Import MIDI File'}
          </div>
          <div className="text-xs text-sky-100/70">
            Select a `.mid` file to convert into V2 JSON and save it directly to local storage.
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100/45">
            {midiImportStatus}
          </div>
        </button>

        <textarea
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
          }}
          spellCheck={false}
          className="min-h-[180px] rounded-[24px] border border-white/10 bg-black/40 p-4 text-xs font-mono leading-relaxed text-amber-50/75 outline-none focus:border-amber-300/35"
          placeholder="Paste legacy text, AI generated JSON, jianpu draft, or note-name draft here."
        />

        <div className="rounded-[24px] border border-fuchsia-300/14 bg-fuchsia-500/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-fuchsia-200/55">AI Conversion Spell</div>
              <div className="mt-1 text-sm text-fuchsia-50/85">
                Copy this prompt into ChatGPT or Gemini, then paste the returned legacy text or JSON back here.
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-4 py-2 text-[11px] font-black tracking-[0.22em] text-fuchsia-100 transition-colors hover:bg-fuchsia-500/18"
            >
              <Copy size={14} />
              COPY
            </button>
          </div>
          <textarea
            value={assistantPrompt}
            readOnly
            spellCheck={false}
            className="mt-4 min-h-[180px] w-full rounded-[22px] border border-white/10 bg-black/35 p-4 text-xs font-mono leading-relaxed text-fuchsia-50/75 outline-none"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div className="rounded-[24px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] leading-relaxed text-amber-100/60">
            <div className="font-black uppercase tracking-[0.25em] text-amber-200/45">Schema Output</div>
            <div className="mt-2">
              Accepts legacy text or AI JSON. Also includes a draft formatter for rough jianpu or note-name input before sending it to an LLM.
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/25 px-4 py-3 text-[11px] text-amber-100/60">
            <div className="flex items-center gap-2 font-black uppercase tracking-[0.25em] text-amber-200/45">
              <Wand2 size={13} />
              Last Convert
            </div>
            <div className="mt-2">
              {lastConverted
                ? `${lastConverted.tracks.reduce((count, track) => count + (track.events?.length ?? 0), 0)} events @ PPQ ${lastConverted.transport.resolution}`
                : 'No conversion yet'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLoadToEditor}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-[11px] font-black tracking-[0.22em] text-emerald-100 transition-colors hover:bg-emerald-500/18"
          >
            <Upload size={14} />
            LOAD TO EDITOR
          </button>
        </div>

        <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-200/45">
              Local Saved Scores
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/35">
              {savedCount} entries
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {savedScores.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-amber-100/35">
                No local converted scores yet
              </div>
            ) : savedScores.map((saved) => (
              <div
                key={saved.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/30 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-amber-50/90">
                    {saved.title}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-amber-100/35">
                    {new Date(saved.savedAt).toLocaleString('zh-TW')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadSaved(saved)}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[10px] font-black tracking-[0.22em] text-sky-100 transition-colors hover:bg-sky-500/18"
                >
                  <Upload size={13} />
                  LOAD
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

export default ScoreConverter;
