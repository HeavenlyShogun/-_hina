import React, { memo } from 'react';
import { ListMusic, Play, SkipBack, SkipForward, Trash2, Plus, Repeat, Shuffle } from 'lucide-react';

const titleOf = (item) => item?.displayTitle ?? item?.title ?? item?.filename ?? item?.slug ?? '未命名曲目';
const durationOf = (item) => {
  const seconds = Math.max(0, Math.floor(Number(item?.duration) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const PlaylistManager = memo(({ queue = [], currentIndex = -1, playMode = 'sequence',
  removeFromQueue, clearQueue, playTrack, playNext, playPrevious, changePlayMode,
  addTrack, featuredScores = [], onAddDefaults }) => {
  const current = queue[currentIndex];
  return (
    <section id="playlist-manager" data-ui-panel="true" className="scroll-mt-6 rounded-3xl border border-white/10 bg-black/40 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-md sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="rounded-xl border border-cyan-200/15 bg-cyan-300/10 p-2 text-cyan-100"><ListMusic size={18} /></span><div><h2 className="text-sm font-black text-white">我的歌單</h2><p className="mt-1 text-[10px] text-white/45">{queue.length} 首歌曲 · {playMode}</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={onAddDefaults} disabled={!featuredScores.length} className="rounded-xl border border-cyan-200/15 bg-cyan-300/10 px-3 py-2 text-[11px] font-bold text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-40">一鍵匯入預設曲庫</button><button type="button" onClick={clearQueue} disabled={!queue.length} className="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold text-white/65 hover:bg-white/10 disabled:opacity-35">清空歌單</button></div>
      </header>
      <div className="mt-4 rounded-2xl border border-violet-200/10 bg-violet-400/[0.07] px-4 py-3">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-200/55">Now Playing</div>
        <div className="mt-1 flex items-center justify-between gap-3"><div className="min-w-0 truncate text-sm font-bold text-violet-50">{current ? titleOf(current) : '尚未播放歌曲'}</div><div className="flex shrink-0 items-center gap-1"><button type="button" aria-label="上一首" disabled={!queue.length} onClick={playPrevious} className="rounded-lg p-2 text-white/65 hover:bg-white/10 disabled:opacity-30"><SkipBack size={16} /></button><button type="button" aria-label="下一首" disabled={!queue.length} onClick={playNext} className="rounded-lg p-2 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-30"><SkipForward size={16} /></button><button type="button" aria-label="切換播放模式" onClick={() => changePlayMode?.(playMode === 'shuffle' ? 'sequence' : 'shuffle')} className={`rounded-lg p-2 hover:bg-white/10 ${playMode === 'shuffle' ? 'text-cyan-200' : 'text-white/50'}`}>{playMode === 'shuffle' ? <Shuffle size={15} /> : <Repeat size={15} />}</button></div></div>
      </div>
      <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
        {queue.length ? queue.map((item, index) => <div key={item.id ?? item.slug ?? item.filename ?? index} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${index === currentIndex ? 'bg-cyan-300/10 text-cyan-50' : 'text-white/70 hover:bg-white/[0.05]'}`}>
          <button type="button" onClick={() => Promise.resolve(playTrack?.(index)).catch((error) => console.error('Failed to play playlist item.', error))} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Play size={13} className="shrink-0 text-cyan-200" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{titleOf(item)}</span><span className="text-[10px] tabular-nums text-white/40">{durationOf(item)}</span></button>
          <button type="button" aria-label={`從歌單移除 ${titleOf(item)}`} onClick={() => removeFromQueue?.(index)} className="rounded-lg p-2 text-white/40 hover:bg-rose-400/10 hover:text-rose-200"><Trash2 size={14} /></button>
        </div>) : <p className="py-3 text-center text-xs text-white/40">歌單目前是空的，從曲庫加入歌曲開始播放。</p>}
      </div>
      <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.025]">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold text-cyan-100/80">從曲庫新增歌曲（{featuredScores.length}）</summary>
        <div className="max-h-48 space-y-1 overflow-y-auto px-2 pb-2">
          {featuredScores.map((item, index) => <div key={item.id ?? item.slug ?? item.filename ?? index} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"><span className="min-w-0 flex-1 truncate text-xs text-white/75">{titleOf(item)}</span><button type="button" aria-label={`加入歌單 ${titleOf(item)}`} onClick={() => addTrack?.(item)} className="rounded-md p-1.5 text-cyan-200 hover:bg-cyan-300/10"><Plus size={14} /></button></div>)}
          {!featuredScores.length && <p className="px-2 py-3 text-xs text-white/40">目前沒有可加入的曲目。</p>}
        </div>
      </details>
    </section>
  );
});

export default PlaylistManager;
