import React, { memo, useCallback, useRef, useState } from 'react';
import {
  ArrowDownUp,
  FileUp,
  Files,
  Music2,
  Trash2,
  Wand2,
} from 'lucide-react';
import { parseMidiToV2 } from '../utils/midiToV2';
import { convertMusicXmlToSlim, mergeSlimScores } from '../utils/musicXmlToSlim';
import { naturalCompareByName, readMusicXmlFile } from '../utils/musicXmlArchive';

const LARGE_FILE_WARNING_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.ceil(bytes / 1024)} KB`;
}

function isMidiFile(file) {
  const name = file?.name?.toLowerCase() || '';
  return name.endsWith('.mid') || name.endsWith('.midi');
}

function isMusicXmlFile(file) {
  const name = file?.name?.toLowerCase() || '';
  return name.endsWith('.musicxml') || name.endsWith('.xml') || name.endsWith('.mxl');
}

function getPayloadSummary(payload) {
  if (Array.isArray(payload?.tracks)) {
    const eventCount = payload.tracks.reduce(
      (count, track) => count + (track.events?.length ?? 0),
      0,
    );
    return `${eventCount} events`;
  }

  if (Array.isArray(payload?.notes)) {
    return `${payload.notes.length} notes`;
  }

  return 'ready';
}

const ScoreConverter = memo(({
  scoreTitle,
  bpm,
  timeSigNum,
  timeSigDen,
  audioConfig,
  accidentals,
  showToast,
  onLoadLocalScore,
  onBatchUpload,
}) => {
  const midiInputRef = useRef(null);
  const musicXmlInputRef = useRef(null);
  const [isImportingMidi, setIsImportingMidi] = useState(false);
  const [isImportingMusicXml, setIsImportingMusicXml] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [convertedResults, setConvertedResults] = useState([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [shouldMergeMusicXmlBatch, setShouldMergeMusicXmlBatch] = useState(true);

  const isImporting = isImportingMidi || isImportingMusicXml;

  const confirmLargeFile = useCallback((file) => {
    if (!file || file.size <= LARGE_FILE_WARNING_BYTES) {
      return true;
    }

    return window.confirm(
      `檔案大小為 ${formatBytes(file.size)}，轉換可能需要較多時間或造成畫面卡頓。是否繼續？`,
    );
  }, []);

  const handleMidiImport = useCallback(async (file, options = {}) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
    }

    const { shouldLoadToEditor = true, shouldSyncInput = true } = options;
    setIsImportingMidi(true);

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

      if (shouldLoadToEditor) {
        onLoadLocalScore?.(payload);
      }

      showToast?.(`已匯入 MIDI：${payload.meta?.title || file.name}`, 'success');
      return {
        file,
        payload,
        sourceType: 'MIDI',
        status: shouldSyncInput ? '已轉換並載入編輯器，等待上傳至 Firestore 曲庫' : '已轉換，等待上傳至 Firestore 曲庫',
      };
    } catch (error) {
      console.error(error);
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

  const handleMusicXmlImport = useCallback(async (file, options = {}) => {
    if (!file || !confirmLargeFile(file)) {
      return null;
    }

    const {
      shouldLoadToEditor = true,
      shouldSyncInput = true,
      articulationRatio,
    } = options;
    setIsImportingMusicXml(true);

    try {
      const { xmlText, extractedFileName, sourceType } = await readMusicXmlFile(file);
      const payload = convertMusicXmlToSlim(xmlText, {
        fileName: extractedFileName || file.name,
        title: scoreTitle.trim() || undefined,
        bpm,
        timeSigNum,
        timeSigDen,
        tone: audioConfig?.tone,
        globalKeyOffset: audioConfig?.globalKeyOffset,
        reverb: audioConfig?.reverb,
        scaleMode: audioConfig?.scaleMode,
        accidentals,
        articulationRatio,
      });

      if (shouldLoadToEditor) {
        onLoadLocalScore?.(payload);
      }

      showToast?.(`${sourceType} 已轉換：${payload.meta?.title || file.name}`, 'success');
      return {
        file,
        payload,
        sourceType,
        status: shouldSyncInput ? '已轉換並載入編輯器，等待上傳至 Firestore 曲庫' : '已轉換，等待上傳至 Firestore 曲庫',
      };
    } catch (error) {
      console.error(error);
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

  const handleMergedMusicXmlImport = useCallback(async (files) => {
    const orderedFiles = [...files].sort(naturalCompareByName);
    if (!orderedFiles.every(confirmLargeFile)) {
      return null;
    }

    setIsImportingMusicXml(true);

    try {
      const convertedScores = [];

      for (const file of orderedFiles) {
        const { xmlText, extractedFileName } = await readMusicXmlFile(file);
        convertedScores.push(convertMusicXmlToSlim(xmlText, {
          fileName: extractedFileName || file.name,
          title: undefined,
          bpm,
          timeSigNum,
          timeSigDen,
          tone: audioConfig?.tone,
          globalKeyOffset: audioConfig?.globalKeyOffset,
          reverb: audioConfig?.reverb,
          scaleMode: audioConfig?.scaleMode,
          accidentals,
          articulationRatio: 0.9,
        }));
      }

      const title = scoreTitle.trim() || `combined_${orderedFiles.length}_musicxml`;
      const payload = mergeSlimScores(convertedScores, {
        title,
        fileName: `${title.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'combined'}-musicxml-slim.json`,
        bpm,
        timeSigNum,
        timeSigDen,
      });
      onLoadLocalScore?.(payload);
      showToast?.(`已合併 ${orderedFiles.length} 份 MusicXML/MXL 並載入編輯器`, 'success');

      return {
        file: {
          name: `${orderedFiles[0].name} ~ ${orderedFiles[orderedFiles.length - 1].name}`,
          size: orderedFiles.reduce((total, file) => total + (file.size || 0), 0),
        },
        payload,
        sourceType: 'MusicXML/MXL Merge',
        status: `已依檔名自然排序合併 ${orderedFiles.length} 份檔案，音長套用 90% 留縫，等待上傳至 Firestore 曲庫`,
      };
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || 'MusicXML/MXL 合併失敗', 'error');
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

  const importFiles = useCallback(async (files) => {
    const acceptedFiles = Array.from(files || []);
    if (!acceptedFiles.length) return;

    const results = [];
    const supportedFiles = acceptedFiles.filter((file) => isMidiFile(file) || isMusicXmlFile(file));
    const unsupportedCount = acceptedFiles.length - supportedFiles.length;

    if (unsupportedCount > 0) {
      showToast?.(`已略過 ${unsupportedCount} 個不支援的檔案。`, 'error');
    }

    const midiFiles = supportedFiles.filter(isMidiFile);
    const musicXmlFiles = supportedFiles.filter(isMusicXmlFile);

    if (shouldMergeMusicXmlBatch && musicXmlFiles.length > 1) {
      const result = await handleMergedMusicXmlImport(musicXmlFiles);
      if (result) {
        results.push(result);
      }
    }

    const filesToConvertSeparately = [
      ...midiFiles,
      ...(shouldMergeMusicXmlBatch && musicXmlFiles.length > 1 ? [] : musicXmlFiles),
    ];

    for (const file of filesToConvertSeparately) {
      const options = {
        shouldLoadToEditor: supportedFiles.length === 1,
        shouldSyncInput: supportedFiles.length === 1,
      };
      const result = isMidiFile(file)
        ? await handleMidiImport(file, options)
        : await handleMusicXmlImport(file, options);

      if (result) {
        results.push(result);
      }
    }

    if (results.length > 0) {
      setConvertedResults((prev) => [...prev, ...results]);
      if (results.length > 1) {
        showToast?.(`已加入 ${results.length} 份譜面到待上傳清單`, 'success');
      }
    }
  }, [
    handleMergedMusicXmlImport,
    handleMidiImport,
    handleMusicXmlImport,
    shouldMergeMusicXmlBatch,
    showToast,
  ]);

  const handleMidiFileChange = useCallback(async (event) => {
    await importFiles(event.target.files);
    event.target.value = '';
  }, [importFiles]);

  const handleMusicXmlFileChange = useCallback(async (event) => {
    await importFiles(event.target.files);
    event.target.value = '';
  }, [importFiles]);

  const handleDrop = useCallback(async (event) => {
    event.preventDefault();
    setIsDraggingOver(false);
    await importFiles(event.dataTransfer?.files);
  }, [importFiles]);

  const handleLoadToEditor = useCallback((payload, options = {}) => {
    try {
      onLoadLocalScore?.(payload, options);
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
  }, [onLoadLocalScore, scoreTitle, showToast]);

  const handleRemoveResult = useCallback((index) => {
    setConvertedResults((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearBatch = useCallback(() => {
    setConvertedResults([]);
    showToast?.('已清除本批待上傳清單', 'success');
  }, [showToast]);

  const handleBatchUpload = useCallback(async () => {
    if (!convertedResults.length || !onBatchUpload) return;
    setIsBatchUploading(true);
    try {
      const payloads = convertedResults.map((res) => ({
        title: res.payload.meta?.title || res.file.name,
        payload: res.payload,
      }));
      const success = await onBatchUpload(payloads);
      if (success) {
        setConvertedResults([]);
        showToast?.(`成功上傳 ${payloads.length} 份譜面至 Firestore 曲庫`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast?.('批次上傳失敗', 'error');
    } finally {
      setIsBatchUploading(false);
    }
  }, [convertedResults, onBatchUpload, showToast]);

  return (
    <section className="rounded-[32px] border border-amber-300/15 bg-amber-500/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200/60">
            <Music2 size={15} />
            Batch Converter
          </div>
          <div className="rounded-[24px] border border-amber-300/15 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/65">
              <Wand2 size={14} />
              新手轉檔演示
            </div>
            <div className="grid gap-3 text-xs text-amber-50/72 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-amber-100">
                  <FileUp size={14} />
                  1. 放入檔案
                </div>
                <p className="leading-relaxed">拖曳 .mid、.musicxml 或 .mxl 到下方框線區，也可以用按鈕選檔。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-amber-100">
                  <Music2 size={14} />
                  2. 檢查結果
                </div>
                <p className="leading-relaxed">轉換完成後會出現在待處理清單，可確認曲名、音符數與來源格式。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-amber-100">
                  <ArrowDownUp size={14} />
                  3. 寫入譜面
                </div>
                <p className="leading-relaxed">按魔杖覆蓋目前譜面，或按合併圖示追加到現有譜面後再播放檢查。</p>
              </div>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-amber-50/80">
            將 MIDI 或 MusicXML 轉成可播放譜面。單檔轉換會直接放進目前譜面；多檔轉換會先放在下方清單，確認後再載入或上傳。
          </p>
          <div className="grid gap-2 pt-2 text-xs text-amber-50/70 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-300/15 bg-black/15 px-3 py-2">
              <span className="font-bold text-amber-100">1. 匯入</span> 拖放檔案，或用下方按鈕選擇 MIDI / MusicXML / MXL。
            </div>
            <div className="rounded-2xl border border-amber-300/15 bg-black/15 px-3 py-2">
              <span className="font-bold text-amber-100">2. 檢查</span> 待上傳清單會顯示來源、大小與轉換出的事件數。
            </div>
            <div className="rounded-2xl border border-amber-300/15 bg-black/15 px-3 py-2">
              <span className="font-bold text-amber-100">3. 套用</span> 魔杖取代目前譜面，雙箭頭接到目前譜面後方。
            </div>
          </div>
        </div>

        <div
          className={`rounded-[24px] border border-dashed px-5 py-8 text-center transition ${
            isDraggingOver
              ? 'border-amber-200 bg-amber-400/10 text-amber-50'
              : 'border-white/15 bg-black/15 text-amber-50/75'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDraggingOver(false);
          }}
          onDrop={handleDrop}
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <div className="rounded-full border border-amber-300/20 bg-amber-500/10 p-3 text-amber-100">
              <FileUp size={24} />
            </div>
            <div>
              <div className="text-base font-bold text-amber-50">拖放 MIDI / MusicXML / MXL 檔案到這裡</div>
              <div className="mt-1 text-sm text-amber-50/55">支援 .mid、.midi、.musicxml、.xml、.mxl；多個 MusicXML/MXL 可自動合併成一首。</div>
            </div>
            <label className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-amber-50/70">
              <input
                type="checkbox"
                checked={shouldMergeMusicXmlBatch}
                onChange={(event) => setShouldMergeMusicXmlBatch(event.target.checked)}
                className="h-4 w-4 accent-amber-300"
              />
              多個 MusicXML/MXL 自動合併成一份譜面
            </label>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => midiInputRef.current?.click()}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                <FileUp size={15} />
                選擇 MIDI
              </button>
              <button
                type="button"
                onClick={() => musicXmlInputRef.current?.click()}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                <Music2 size={15} />
                選擇 MusicXML/MXL
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/55">Pending Uploads</div>
              <div className="mt-1 text-xs text-amber-50/55">這裡是已轉換但尚未上傳的譜面。右側按鈕依序為載入取代、接到目前譜面後方、移除此項。</div>
            </div>
            <div className="flex flex-wrap gap-2">
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
                onClick={handleClearBatch}
                disabled={!convertedResults.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <Trash2 size={15} />
                清除本批
              </button>
            </div>
          </div>

          <div className="custom-scrollbar max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {convertedResults.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-amber-50/45">
                尚未有轉換結果。選擇單一檔案會直接載入目前譜面；選擇多個檔案後，結果會集中列在這裡。
              </div>
            ) : convertedResults.map((result, index) => (
              <div key={`${result.file.name}-${index}`} className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-amber-50">
                      {result.payload?.meta?.title || result.file.name}
                    </div>
                    <span className="rounded-full border border-amber-300/15 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100/75">
                      {result.sourceType}
                    </span>
                    {result.payload?.meta?.sourceFileCount > 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/15 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-100/75">
                        <Files size={11} />
                        {result.payload.meta.sourceFileCount} files
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-amber-50/55">
                    {result.file.name} · {formatBytes(result.file.size)} · {getPayloadSummary(result.payload)}
                  </div>
                  <div className="mt-1 text-xs text-emerald-100/70">
                    {result.status}
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
          accept=".musicxml,.xml,.mxl,application/xml,text/xml,application/vnd.recordare.musicxml"
          className="hidden"
          onChange={handleMusicXmlFileChange}
        />
      </div>
    </section>
  );
});

export default ScoreConverter;
