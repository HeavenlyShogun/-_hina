import React, { memo, useState } from 'react';
import {
  Copy,
  DatabaseZap,
  FolderOpen,
  Link2,
  ListX,
  Share2,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { KEY_OPTIONS } from '../constants/music';

function formatKeyLabel(offset, scaleMode) {
  const matched = KEY_OPTIONS.find((option) => option.offset === Number(offset));
  const tonic = matched?.displayName ?? matched?.name ?? 'C';
  const modeLabel = scaleMode === 'minor' ? 'Minor' : scaleMode === 'custom' ? 'Custom' : 'Major';
  return `${tonic} ${modeLabel}`;
}

function formatToneLabel(tone) {
  if (Array.isArray(tone)) {
    return tone.map(formatToneLabel).join(' + ');
  }

  const labels = {
    piano: 'Piano',
    'tongue-drum': 'Tongue Drum',
    'tongue-drum-electronic': 'Electronic Tongue Drum',
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
    return '正在連線 Firebase...';
  }
  if (cloudStatus === 'error') {
    return '雲端曲庫連線失敗';
  }
  if (cloudStatus === 'unavailable') {
    return 'Firebase 尚未完成設定';
  }
  return '雲端曲庫待連線';
}

function formatDate(score) {
  const seconds = score.updatedAt?.seconds ?? score.sharedAt?.seconds ?? Date.now() / 1000;
  return new Date(seconds * 1000).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const ScoreLibrary = memo(({
  user,
  savedScores,
  publicScores = [],
  onLoadScore,
  onLoadPublicScore,
  onCopyPublicScore,
  onShareScore,
  onClearAll,
  onDeleteScore,
  onConnectCloud,
  cloudStatus,
  cloudError,
}) => {
  const [activeTab, setActiveTab] = useState('mine');
  const visibleScores = activeTab === 'public' ? publicScores : savedScores;

  return (
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
              連線後可保存、分享、載入與清空自己的譜面，也可瀏覽玩家共享譜庫。
            </div>
          )}
          <button
            type="button"
            onClick={onConnectCloud}
            disabled={cloudStatus === 'loading'}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-2 text-xs font-bold tracking-[0.18em] text-sky-200 disabled:opacity-50"
          >
            {cloudStatus === 'loading' ? '連線中' : '連線 Firebase'}
          </button>
        </div>
      )}

      {cloudStatus === 'ready' && !user && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[32px] bg-black/65 px-6 text-center text-xs font-bold tracking-[0.18em] text-white/55 backdrop-blur-sm">
          已連線 Firebase，等待匿名帳號完成初始化。
        </div>
      )}

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-sky-200/60">
            <UploadCloud size={15} />
            Cloud Library
          </div>
          <div className="mt-2 text-sm font-semibold text-sky-50/90">
            雲端曲庫與共享譜庫
          </div>
          <div className="mt-1 text-xs leading-relaxed text-white/45">
            保存自己的譜面，也可把完成品生成分享連結或複製玩家共享譜面。
          </div>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          disabled={activeTab === 'public'}
          className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-2 text-rose-200/70 transition-colors hover:bg-rose-500/20 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="清空雲端曲庫"
        >
          <ListX size={15} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('mine')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-[0.16em] transition ${activeTab === 'mine' ? 'bg-sky-500/18 text-sky-100' : 'text-white/45 hover:text-sky-100'}`}
        >
          <FolderOpen size={13} />
          我的樂譜
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('public')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-[0.16em] transition ${activeTab === 'public' ? 'bg-amber-500/18 text-amber-100' : 'text-white/45 hover:text-amber-100'}`}
        >
          <Users size={13} />
          玩家共享
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
        {visibleScores.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center">
            <div className="text-xs font-semibold text-white/65">
              {activeTab === 'public' ? '目前沒有共享譜面' : '目前沒有雲端譜面'}
            </div>
            <div className="mt-2 text-xs leading-relaxed text-white/35">
              {activeTab === 'public'
                ? '用「生成分享連結」公開譜面後，這裡會出現玩家共享清單。'
                : '連線 Firebase 後，點擊編輯器的存入雲端按鈕即可建立自己的曲庫。'}
            </div>
          </div>
        ) : visibleScores.map((saved) => (
          <div
            key={saved.id}
            onClick={() => (activeTab === 'public' ? onLoadPublicScore(saved) : onLoadScore(saved))}
            className="group relative flex cursor-pointer items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-sky-300/30 hover:bg-sky-500/10"
          >
            <div className="min-w-0 flex-1 overflow-hidden pr-2">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-bold text-sky-50">{saved.title}</div>
                {saved.isPublic ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-amber-100">
                    <Share2 size={11} />
                    Public
                  </span>
                ) : null}
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
                <span>{formatDate(saved)}</span>
                {saved.bpm ? <span className="text-emerald-300">BPM {saved.bpm}</span> : null}
                <span className="text-sky-300">{formatKeyLabel(saved.globalKeyOffset, saved.scaleMode)}</span>
                {saved.tone ? <span className="text-amber-300">{formatToneLabel(saved.tone)}</span> : null}
                <span className="text-violet-300">{formatContentLength(saved.contentLength)}</span>
                {activeTab === 'public' ? <span className="text-amber-200">Copies {saved.copiedCount ?? 0}</span> : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300 transition-all group-hover:bg-sky-500/25 group-hover:text-sky-100" title="載入譜面">
                <FolderOpen size={16} />
              </div>
              {activeTab === 'public' ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyPublicScore(saved.id);
                  }}
                  className="rounded-xl p-2 text-emerald-300/60 transition-all hover:bg-emerald-500/20 hover:text-emerald-100"
                  title="複製到我的工作台"
                >
                  <Copy size={16} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShareScore(saved);
                    }}
                    className="rounded-xl p-2 text-amber-300/60 transition-all hover:bg-amber-500/20 hover:text-amber-100"
                    title="生成分享連結"
                  >
                    <Share2 size={16} />
                  </button>
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
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default ScoreLibrary;
