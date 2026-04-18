import React, { memo } from 'react';
import { FolderOpen, ListX, Trash2, UploadCloud } from 'lucide-react';

const ScoreLibrary = memo(({ user, savedScores, onLoadScore, onClearAll, onDeleteScore, onConnectCloud, cloudStatus }) => (
  <div className="bg-black/40 border border-white/5 rounded-[40px] p-6 flex flex-col h-fit max-h-[500px] backdrop-blur-sm shadow-inner relative">
    {cloudStatus !== 'ready' && (
      <div className="absolute inset-0 bg-black/60 rounded-[40px] backdrop-blur-md z-10 flex flex-col items-center justify-center gap-4 text-xs text-white/50 font-bold tracking-widest px-6 text-center">
        <div>{cloudStatus === 'loading' ? '雲端連線中...' : '按下按鈕後才會載入 Firebase 雲端功能'}</div>
        <button onClick={onConnectCloud} disabled={cloudStatus === 'loading'} className="px-5 py-2 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 disabled:opacity-50">
          {cloudStatus === 'loading' ? 'CONNECTING' : 'CONNECT CLOUD'}
        </button>
      </div>
    )}
    {cloudStatus === 'ready' && !user && <div className="absolute inset-0 bg-black/60 rounded-[40px] backdrop-blur-md z-10 flex items-center justify-center text-xs text-white/50 font-bold tracking-widest">尚未登入</div>}
    <div className="flex items-center justify-between mb-6 px-2">
      <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] tracking-[0.2em] uppercase"><UploadCloud size={16} /> 雲端譜庫<span className="text-[8px] opacity-50 ml-1">（依更新時間排序）</span></div>
      <button onClick={onClearAll} className="text-rose-400/50 hover:text-rose-400 transition-colors p-1" title="清空所有譜面"><ListX size={14} /></button>
    </div>
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
      {savedScores.length === 0 ? <div className="text-center py-20 opacity-10 text-[10px] uppercase tracking-widest">Library Empty</div> : savedScores.map((saved) => (
        <div key={saved.id} onClick={() => onLoadScore(saved)} className="group bg-white/[0.03] p-4 rounded-3xl border border-white/10 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all relative flex items-center justify-between cursor-pointer">
          <div className="flex-1 overflow-hidden pr-2">
            <div className="text-sm font-bold text-emerald-50 truncate">{saved.title}</div>
            <div className="text-[9px] opacity-40 mt-1 flex gap-2 uppercase tracking-wider">
              <span>{new Date((saved.updatedAt?.seconds ?? Date.now() / 1000) * 1000).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {saved.bpm && <span className="text-emerald-300">bpm:{saved.bpm}</span>}
              {saved.tone && <span className="text-amber-300">{saved.tone}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 transition-opacity">
            <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-md" title="載入這份譜面"><FolderOpen size={16} /></div>
            <button onClick={(event) => { event.stopPropagation(); onDeleteScore(saved.id); }} className="p-2 text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/20 rounded-xl transition-all" title="刪除"><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  </div>
));

export default ScoreLibrary;
