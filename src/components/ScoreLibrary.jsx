import React, { memo } from 'react';
import { FolderOpen, Link2, ListX, Trash2, UploadCloud } from 'lucide-react';
import { KEY_OPTIONS } from '../constants/music';

function formatKeyLabel(offset, scaleMode) {
  const matched = KEY_OPTIONS.find((option) => option.offset === Number(offset));
  const tonic = matched?.name ?? 'C';
  const modeLabel = scaleMode === 'minor' ? '小調' : scaleMode === 'custom' ? '自訂' : '大調';
  return `${tonic} ${modeLabel}`;
}

function formatToneLabel(tone) {
  const labels = {
    piano: '真鋼琴',
    'lyre-long': '長琴',
    'lyre-short': '短琴',
    flute: '長笛',
    'tongue-drum': '空靈鼓',
  };

  return labels[tone] ?? tone;
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
  <div className="bg-black/40 border border-white/5 rounded-[40px] p-6 flex flex-col h-fit max-h-[500px] backdrop-blur-sm shadow-inner relative">
    {cloudStatus !== 'ready' && (
      <div className="absolute inset-0 bg-black/60 rounded-[40px] backdrop-blur-md z-10 flex flex-col items-center justify-center gap-4 px-6 text-center text-xs font-bold tracking-widest text-white/50">
        <div>{cloudStatus === 'loading' ? '正在連線雲端...' : '尚未連線 Firebase 雲端琴譜庫'}</div>
        {cloudError ? (
          <div className="max-w-[240px] text-[10px] leading-relaxed tracking-normal text-rose-200/80">
            {cloudError}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onConnectCloud}
          disabled={cloudStatus === 'loading'}
          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-5 py-2 text-emerald-300 disabled:opacity-50"
        >
          {cloudStatus === 'loading' ? '連線中' : '連線雲端'}
        </button>
      </div>
    )}
    {cloudStatus === 'ready' && !user && (
      <div className="absolute inset-0 bg-black/60 rounded-[40px] backdrop-blur-md z-10 flex items-center justify-center text-xs font-bold tracking-widest text-white/50">
        等待登入狀態
      </div>
    )}

    <div className="mb-6 flex items-center justify-between px-2">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
        <UploadCloud size={16} />
        雲端琴譜庫
        <span className="ml-1 text-[8px] opacity-50">可同步與備份</span>
      </div>
      <button
        type="button"
        onClick={onClearAll}
        className="p-1 text-rose-400/50 transition-colors hover:text-rose-400"
        title="清空所有雲端琴譜"
      >
        <ListX size={14} />
      </button>
    </div>

    <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-2">
      {savedScores.length === 0 ? (
        <div className="py-20 text-center text-[10px] uppercase tracking-widest opacity-20">
          尚無雲端琴譜
        </div>
      ) : savedScores.map((saved) => (
        <div
          key={saved.id}
          onClick={() => onLoadScore(saved)}
          className="group relative flex cursor-pointer items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/20"
        >
          <div className="min-w-0 flex-1 overflow-hidden pr-2">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-bold text-emerald-50">{saved.title}</div>
              {Array.isArray(saved.references) && saved.references.length > 0 ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black tracking-[0.18em] text-sky-200"
                  title="這份琴譜包含參考資料"
                >
                  <Link2 size={11} />
                  參考
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex gap-2 text-[9px] uppercase tracking-wider opacity-45">
              <span>{new Date((saved.updatedAt?.seconds ?? Date.now() / 1000) * 1000).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {saved.bpm && <span className="text-emerald-300">速度:{saved.bpm}</span>}
              <span className="text-sky-300">{formatKeyLabel(saved.globalKeyOffset, saved.scaleMode)}</span>
              {saved.tone && <span className="text-amber-300">{formatToneLabel(saved.tone)}</span>}
              {Array.isArray(saved.references) && saved.references.length > 0 && <span className="text-violet-300">參考:{saved.references.length}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400 shadow-md transition-all group-hover:bg-emerald-500 group-hover:text-white" title="載入琴譜">
              <FolderOpen size={16} />
            </div>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onDeleteScore(saved.id); }}
              className="rounded-xl p-2 text-rose-400/40 transition-all hover:bg-rose-500/20 hover:text-rose-400"
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
