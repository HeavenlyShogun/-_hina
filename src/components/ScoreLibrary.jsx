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
  const handleTabKeyDown = (event) => {
    const tabs = ['mine', 'public'];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`cloud-library-tab-${nextTab}`)?.focus();
  };

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

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-1" role="tablist" aria-label="雲端曲庫分類" onKeyDown={handleTabKeyDown}>
        <button
          id="cloud-library-tab-mine"
          type="button"
          role="tab"
          aria-selected={activeTab === 'mine'}
          aria-controls="cloud-library-panel"
          tabIndex={activeTab === 'mine' ? 0 : -1}
          onClick={() => setActiveTab('mine')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-[0.16em] transition ${activeTab === 'mine' ? 'bg-sky-500/18 text-sky-100' : 'text-white/45 hover:text-sky-100'}`}
        >
          <FolderOpen size={13} />
          我的樂譜
        </button>
        <button
          id="cloud-library-tab-public"
          type="button"
          role="tab"
          aria-selected={activeTab === 'public'}
          aria-controls="cloud-library-panel"
          tabIndex={activeTab === 'public' ? 0 : -1}
          onClick={() => setActiveTab('public')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black tracking-[0.16em] transition ${activeTab === 'public' ? 'bg-amber-500/18 text-amber-100' : 'text-white/45 hover:text-amber-100'}`}
        >
          <Users size={13} />
          玩家共享
        </button>
      </div>

      <div id="cloud-library-panel" role="tabpanel" aria-labelledby={`cloud-library-tab-${activeTab}`} tabIndex={0} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
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
          <div key={saved.id} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 transition-colors hover:border-sky-300/30 hover:bg-sky-500/10">
            <button
              type="button"
              onClick={() => (activeTab === 'public' ? onLoadPublicScore(saved) : onLoadScore(saved))}
              aria-label={`載入譜面 ${saved.title}`}
              className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md p-3 text-left transition-colors hover:bg-sky-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-sky-50">{saved.title}</span>
                  {saved.isPublic ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-amber-100">
                      <Share2 size={11} />
                      Public
                    </span>
                  ) : null}
                  {Array.isArray(saved.references) && saved.references.length > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-sky-200" title="含參考資料">
                      <Link2 size={11} />
                      Ref
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-white/55">
                  <span>{formatDate(saved)}</span>
                  {saved.bpm ? <span className="text-emerald-300">BPM {saved.bpm}</span> : null}
                  <span className="text-sky-300">{formatKeyLabel(saved.globalKeyOffset, saved.scaleMode)}</span>
                  {saved.tone ? <span className="text-amber-300">{formatToneLabel(saved.tone)}</span> : null}
                  <span className="text-violet-300">{formatContentLength(saved.contentLength)}</span>
                  {activeTab === 'public' ? <span className="text-amber-200">Copies {saved.copiedCount ?? 0}</span> : null}
                </span>
              </span>
              <FolderOpen size={16} className="shrink-0 text-sky-300 transition-colors group-hover:text-sky-100" />
            </button>
            <div className="flex shrink-0 items-center gap-1">
              {activeTab === 'public' ? (
                <button
                  type="button"
                  onClick={() => onCopyPublicScore(saved.id)}
                  aria-label={`複製到我的工作台 ${saved.title}`}
                  className="rounded-lg p-2 text-emerald-300/60 transition-all hover:bg-emerald-500/20 hover:text-emerald-100"
                  title="複製到我的工作台"
                >
                  <Copy size={16} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onShareScore(saved)}
                    aria-label={`生成分享連結 ${saved.title}`}
                    className="rounded-lg p-2 text-amber-300/60 transition-all hover:bg-amber-500/20 hover:text-amber-100"
                    title="生成分享連結"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteScore(saved.id)}
                    aria-label={`刪除 ${saved.title}`}
                    className="rounded-lg p-2 text-rose-300/45 transition-all hover:bg-rose-500/20 hover:text-rose-200"
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
