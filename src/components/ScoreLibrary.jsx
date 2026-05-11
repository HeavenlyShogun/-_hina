import React, { memo } from 'react';
import { DatabaseZap, FolderOpen, Link2, ListX, Trash2, UploadCloud } from 'lucide-react';
import { KEY_OPTIONS } from '../constants/music';

function formatKeyLabel(offset, scaleMode) {
  const matched = KEY_OPTIONS.find((option) => option.offset === Number(offset));
  const tonic = matched?.name ?? 'C';
  const modeLabel = scaleMode === 'minor' ? 'Minor' : scaleMode === 'custom' ? 'Custom' : 'Major';
  return `${tonic} ${modeLabel}`;
}

function formatToneLabel(tone) {
  if (Array.isArray(tone)) {
    return tone.map(formatToneLabel).join(' + ');
  }

  const labels = {
    piano: 'Piano',
    violin: 'Violin',
    'lyre-long': 'Lyre Long',
    'lyre-short': 'Lyre Short',
    flute: 'Flute',
    'tongue-drum': 'Tongue Drum',
  };

  return labels[tone] ?? tone ?? 'Unknown';
}

function formatContentLength(length) {
  if (!Number.isFinite(length) || length <= 0) {
    return '0 B';
  }
  if (length < 1024) {
    return `${length} B`;
  }
  if (length < 1024 * 1024) {
    return `${(length / 1024).toFixed(1)} KB`;
  }
  return `${(length / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusText(cloudStatus) {
  if (cloudStatus === 'loading') {
    return '正在連線到 Firebase...';
  }
  if (cloudStatus === 'error') {
    return '雲端連線發生錯誤';
  }
  if (cloudStatus === 'unavailable') {
    return 'Firebase 尚未完成設定';
  }
  return '尚未連線到雲端曲庫';
}

const ScoreLibrary = memo(({
  user,
  savedScores,
  onLoadScore,
  onClearAll,
  onDeleteScore,
  onConnectCloud,
  cloudStatus,
  cloudError,
}) => (
  <div className="relative flex h-fit min-h-[360px] flex-col rounded-[32px] border border-white/8 bg-black/35 p-6 shadow-inner backdrop-blur-sm">
    {cloudStatus !== 'ready' && (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[32px] bg-black/70 px-6 text-center">
        <DatabaseZap size={20} className="text-sky-300" />
        <div className="text-xs font-bold tracking-[0.2em] text-white/75">
          {getStatusText(cloudStatus)}
        </div>
        {cloudError ? (
          <div className="max-w-[260px] text-xs leading-relaxed text-rose-200/85">
            {cloudError}
          </div>
        ) : (
          <div className="max-w-[260px] text-xs leading-relaxed text-white/45">
            目前先保留雲端曲庫存系統的登入、同步與摘要載入骨架。
          </div>
        )}
        <button
          type="button"
          onClick={onConnectCloud}
          disabled={cloudStatus === 'loading'}
          className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-2 text-xs font-bold tracking-[0.18em] text-sky-200 disabled:opacity-50"
        >
          {cloudStatus === 'loading' ? '連線中' : '連接 Firebase'}
        </button>
      </div>
    )}

    {cloudStatus === 'ready' && !user && (
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[32px] bg-black/65 px-6 text-center text-xs font-bold tracking-[0.18em] text-white/55 backdrop-blur-sm">
        已建立 Firebase 連線，等待登入狀態回來。
      </div>
    )}

    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-sky-200/60">
          <UploadCloud size={15} />
          Cloud Library
        </div>
        <div className="mt-2 text-sm font-semibold text-sky-50/90">
          雲端曲庫存系統骨架
        </div>
        <div className="mt-1 text-xs leading-relaxed text-white/45">
          保留譜面摘要、讀取、刪除與清空入口，先移除多餘展示。
        </div>
      </div>
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-2 text-rose-200/70 transition-colors hover:bg-rose-500/20 hover:text-rose-100"
        title="清空雲端曲庫"
      >
        <ListX size={15} />
      </button>
    </div>

    <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
      {savedScores.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center">
          <div className="text-xs font-semibold text-white/65">尚無雲端譜面</div>
          <div className="mt-2 text-xs leading-relaxed text-white/35">
            完成 Firebase 設定後，這裡會顯示最新同步的曲庫摘要。
          </div>
        </div>
      ) : savedScores.map((saved) => (
        <div
          key={saved.id}
          onClick={() => onLoadScore(saved)}
          className="group relative flex cursor-pointer items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-sky-300/30 hover:bg-sky-500/10"
        >
          <div className="min-w-0 flex-1 overflow-hidden pr-2">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-bold text-sky-50">{saved.title}</div>
              {Array.isArray(saved.references) && saved.references.length > 0 ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-sky-200"
                  title="含參考資料"
                >
                  <Link2 size={11} />
                  Ref
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-white/55">
              <span>{new Date((saved.updatedAt?.seconds ?? Date.now() / 1000) * 1000).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {saved.bpm ? <span className="text-emerald-300">BPM {saved.bpm}</span> : null}
              <span className="text-sky-300">{formatKeyLabel(saved.globalKeyOffset, saved.scaleMode)}</span>
              {saved.tone ? <span className="text-amber-300">{formatToneLabel(saved.tone)}</span> : null}
              <span className="text-violet-300">{formatContentLength(saved.contentLength)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300 transition-all group-hover:bg-sky-500/25 group-hover:text-sky-100" title="載入譜面">
              <FolderOpen size={16} />
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteScore(saved.id);
              }}
              className="rounded-xl p-2 text-rose-300/45 transition-all hover:bg-rose-500/20 hover:text-rose-200"
              title="刪除"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
));

export default ScoreLibrary;
