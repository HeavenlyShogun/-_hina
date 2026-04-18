import React, { memo } from 'react';
import { Keyboard, Music2, Play, Square } from 'lucide-react';

const AppHeader = memo(({ playHotkey, setPlayHotkey, isPlaying, onTogglePlay }) => (
  <header className="z-30 w-full max-w-6xl mt-8 px-6 flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02] backdrop-blur-sm p-6 rounded-[30px] border border-white/5 shadow-xl">
    <div className="flex items-center gap-5">
      <div className="bg-emerald-500/20 p-3 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]"><Music2 className="text-emerald-400" size={28} /></div>
      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-emerald-100">風物之詩琴<span className="text-emerald-500 italic ml-1">Studio</span></h1>
        <p className="text-[9px] tracking-[0.4em] uppercase opacity-30 font-sans mt-0.5">Teyvat Lyre Practice Suite v25.0</p>
      </div>
    </div>
    <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
      <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/5">
        <Keyboard size={14} className="text-emerald-400/50" />
        <select value={playHotkey} onChange={(event) => setPlayHotkey(event.target.value)} className="bg-transparent outline-none text-xs text-emerald-100/70 cursor-pointer">
          <option value="Space" className="bg-[#0f172a]">播放熱鍵：Space</option>
          <option value="Enter" className="bg-[#0f172a]">播放熱鍵：Enter</option>
          <option value="None" className="bg-[#0f172a]">停用播放熱鍵</option>
        </select>
      </div>
      <button onClick={onTogglePlay} className={`flex items-center justify-center gap-4 px-10 py-3.5 rounded-full font-black text-sm tracking-[0.2em] transition-all transform active:scale-95 shadow-2xl w-full md:w-auto ${isPlaying ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/40'}`}>
        {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        {isPlaying ? '停止播放' : '開始播放'}
      </button>
    </div>
  </header>
));

export default AppHeader;
