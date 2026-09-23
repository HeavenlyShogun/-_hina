import React, { memo, useState } from 'react';
import { ArrowLeft, ArrowRight, ListMusic, Plus, Trash2, X } from 'lucide-react';

const MODE_LABELS = {
  sequence: '\u4f9d\u5e8f\u64ad\u653e',
  'loop-all': '\u6e05\u55ae\u5faa\u74b0',
  'loop-one': '\u55ae\u66f2\u5faa\u74b0',
  shuffle: '\u96a8\u6a5f\u64ad\u653e',
};

function playQueueItem(playQueueIndex, index) {
  playQueueIndex?.(index)?.catch((error) => {
    console.error('Failed to play playlist track.', error);
  });
}

function formatDuration(ticks, bpm = 120) {
  const seconds = Math.max(0, Number(ticks) || 0) / 480 * 60 / Math.max(Number(bpm) || 120, 1);
  if (!seconds) return '\u6642\u9577\u672a\u77e5';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

const ScoreTopPlaylistBar = memo(({ playlist }) => {
  const [selectedScoreId, setSelectedScoreId] = useState('');
  const {
    queue = [], currentIndex = -1, playMode = 'sequence', playModes = [], scores = [],
    addToQueue, removeFromQueue, reorderQueue, clearQueue, changePlayMode, playQueueIndex,
  } = playlist ?? {};
  const selectedScore = scores.find((item) => String(item.id ?? item.slug) === selectedScoreId);

  return (
    <section aria-label={'\u64ad\u653e\u6e05\u55ae'} data-ui-panel="true" className="mb-4 rounded-2xl border border-cyan-200/15 bg-slate-950/70 px-3 py-3 shadow-[0_12px_38px_rgba(2,8,23,0.35)] backdrop-blur-xl sm:px-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-100"><ListMusic size={15} />{'\u64ad\u653e\u6e05\u55ae'} <span className="text-[10px] font-semibold tracking-normal text-slate-400">{queue.length} {'\u9996'}</span></div>
        <div className="flex items-center gap-2">
          <select aria-label={'\u9023\u64ad\u6a21\u5f0f'} value={playMode} onChange={(event) => changePlayMode?.(event.target.value)} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200">
            {playModes.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode] ?? mode}</option>)}
          </select>
          <button type="button" onClick={clearQueue} disabled={!queue.length} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-rose-200/80 transition hover:bg-rose-400/10 disabled:opacity-40"><Trash2 size={12} />{'\u6e05\u7a7a\u6e05\u55ae'}</button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="custom-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          {queue.length ? queue.map((item, index) => {
            const active = index === currentIndex;
            return (
              <div key={`${item.id ?? item.slug ?? item.filename ?? item.displayTitle}-${index}`} className={`group flex shrink-0 items-center gap-1 rounded-xl border px-2 py-1.5 transition ${active ? 'border-cyan-300/80 bg-cyan-400/15 text-white shadow-[0_0_18px_rgba(34,211,238,0.24)] ring-1 ring-cyan-300/35' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-200/30 hover:bg-white/[0.08]'}`}>
                <button type="button" onClick={() => playQueueItem(playQueueIndex, index)} title={`Play ${item.displayTitle ?? item.title ?? 'track'}`} className="flex max-w-52 items-center gap-2 text-left">
                  <span className="text-[10px] font-black tabular-nums text-cyan-200/80">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-bold">{item.displayTitle ?? item.title ?? item.filename ?? '\u672a\u547d\u540d\u66f2\u76ee'}</span><span className="block text-[9px] text-slate-400">{Number(item.noteCount) ? `${Number(item.noteCount).toLocaleString()} \u97f3\u7b26` : formatDuration(item.durationTicks, item.bpm)}</span></span>
                  {active ? <span className="equalizer flex h-4 items-end gap-0.5" aria-label={'\u6b63\u5728\u64ad\u653e'}><i /><i /><i /></span> : null}
                </button>
                <button type="button" aria-label="Move left" disabled={!index} onClick={() => reorderQueue?.(index, index - 1)} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-20"><ArrowLeft size={12} /></button>
                <button type="button" aria-label="Move right" disabled={index === queue.length - 1} onClick={() => reorderQueue?.(index, index + 1)} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-20"><ArrowRight size={12} /></button>
                <button type="button" aria-label="Remove track" onClick={() => removeFromQueue?.(index)} className="rounded p-1 text-slate-500 hover:bg-rose-400/15 hover:text-rose-200"><X size={13} /></button>
              </div>
            );
          }) : <span className="px-2 py-2 text-[11px] text-slate-500">{'\u6e05\u55ae\u9084\u6c92\u6709\u66f2\u76ee'}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select aria-label={'\u9078\u64c7\u66f2\u5eab\u66f2\u76ee'} value={selectedScoreId} onChange={(event) => setSelectedScoreId(event.target.value)} className="w-24 max-w-36 rounded-lg border border-white/10 bg-slate-900 px-1.5 py-1.5 text-[9px] text-slate-300 sm:w-auto sm:px-2 sm:text-[10px]">
            <option value="">{'\u9078\u64c7\u66f2\u5eab\u66f2\u76ee'}</option>
            {scores.map((item, index) => <option key={item.id ?? item.slug ?? index} value={String(item.id ?? item.slug)}>{item.displayTitle ?? item.title ?? item.filename}</option>)}
          </select>
          <button type="button" disabled={!selectedScore} onClick={() => { addToQueue?.(selectedScore); setSelectedScoreId(''); }} className="inline-flex items-center gap-1 rounded-lg border border-cyan-200/20 bg-cyan-500/10 px-2 py-1.5 text-[10px] font-bold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"><Plus size={12} />{'\u52a0\u5165'}</button>
        </div>
      </div>
    </section>
  );
});

export default ScoreTopPlaylistBar;
