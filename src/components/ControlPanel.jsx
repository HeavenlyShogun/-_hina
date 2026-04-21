import React, { memo } from 'react';
import { Clock, Globe, Music, Volume2, Zap } from 'lucide-react';
import { KEY_OPTIONS } from '../constants/music';

const ControlPanel = memo(({
  bpm,
  setBpm,
  timeSigNum,
  setTimeSigNum,
  timeSigDen,
  setTimeSigDen,
  charResolution,
  setCharResolution,
  vol,
  setVol,
  tone,
  setTone,
  reverb,
  onToggleReverb,
  globalKeyOffset,
  setGlobalKeyOffset,
}) => (
  <section className="z-30 w-full max-w-6xl my-10 flex flex-col gap-4 px-6">
    <div className="flex flex-wrap justify-center items-center gap-4">
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md shadow-inner" title="調整播放速度">
        <Zap size={15} className="text-amber-400 shrink-0" />
        <input type="range" min="20" max="300" step="1" value={Number(bpm) || 20} onChange={(event) => setBpm(Number(event.target.value))} className="hidden sm:block w-20 md:w-24 accent-amber-400" />
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5 focus-within:border-amber-500/50 transition-colors">
          <button onClick={() => setBpm((value) => Math.max(20, (Number(value) || 77) - 1))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-md text-amber-400/80 hover:text-amber-400 transition-colors text-lg leading-none">-</button>
          <input type="number" value={bpm} onChange={(event) => setBpm(event.target.value === '' ? '' : Number(event.target.value))} onBlur={() => { const value = Number(bpm); if (!value || value < 20) setBpm(20); else if (value > 300) setBpm(300); }} className="w-10 bg-transparent text-center text-xs font-mono text-emerald-100 outline-none no-spinners" />
          <button onClick={() => setBpm((value) => Math.min(300, (Number(value) || 77) + 1))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-md text-amber-400/80 hover:text-amber-400 transition-colors text-lg leading-none">+</button>
        </div>
        <span className="opacity-30 text-[9px] font-mono tracking-widest shrink-0 ml-1">BPM</span>
      </div>
      <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Clock size={15} className="text-emerald-400 shrink-0" />
        <span className="text-[10px] font-black text-emerald-200/70 uppercase tracking-widest mr-1 hidden sm:inline">拍號</span>
        <select value={timeSigNum} onChange={(event) => setTimeSigNum(Number(event.target.value))} className="bg-transparent outline-none text-sm text-emerald-400 font-black cursor-pointer appearance-none text-center">
          {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((value) => <option key={value} value={value} className="bg-slate-900">{value}</option>)}
        </select>
        <span className="text-emerald-500/50 font-bold mx-0.5">/</span>
        <select value={timeSigDen} onChange={(event) => setTimeSigDen(Number(event.target.value))} className="bg-transparent outline-none text-sm text-emerald-400 font-black cursor-pointer appearance-none text-center">
          {[2, 4, 8, 16].map((value) => <option key={value} value={value} className="bg-slate-900">{value}</option>)}
        </select>
        <div className="w-px h-4 bg-emerald-500/30 mx-2 md:mx-3" />
        <span className="text-[10px] font-black text-emerald-200/70 uppercase tracking-widest mr-1 md:mr-2">1 格 =</span>
        <select value={charResolution} onChange={(event) => setCharResolution(Number(event.target.value))} className="bg-transparent outline-none text-[11px] text-emerald-400 font-black cursor-pointer">
          <option value={4} className="bg-slate-900">4 分音符</option>
          <option value={8} className="bg-slate-900">8 分音符</option>
          <option value={16} className="bg-slate-900">16 分音符</option>
          <option value={32} className="bg-slate-900">32 分音符</option>
        </select>
      </div>
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Volume2 size={15} className="text-emerald-400" />
        <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(event) => setVol(Number(event.target.value))} className="w-20 md:w-24 accent-emerald-400" />
      </div>
    </div>
    <div className="flex flex-wrap justify-center items-center gap-4">
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Music size={15} className="text-pink-400" />
        <select value={tone} onChange={(event) => setTone(event.target.value)} className="bg-transparent outline-none text-[11px] font-black text-emerald-100 uppercase cursor-pointer">
          <option value="piano" className="bg-[#0f172a]">鋼琴 (Piano)</option>
          <option value="flute" className="bg-[#0f172a]">長笛 (Flute)</option>
          <option value="tongue-drum" className="bg-[#0f172a]">空靈鼓 (Steel Tongue)</option>
          <option value="lyre-long" className="bg-[#0f172a]">詩琴長音 (Long)</option>
          <option value="lyre-short" className="bg-[#0f172a]">詩琴短音 (Short)</option>
          <option value="classic" className="bg-[#0f172a]">經典音色 (Classic)</option>
        </select>
      </div>
      <button onClick={onToggleReverb} className={`px-6 py-2.5 rounded-full border transition-all text-[10px] font-black tracking-widest ${reverb ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-white/5 text-white/20 border-white/10'}`}>REVERB <span className="ml-1 opacity-30">{reverb ? 'ON' : 'OFF'}</span></button>
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Globe size={15} className="text-indigo-400" />
        <select value={globalKeyOffset} onChange={(event) => setGlobalKeyOffset(Number(event.target.value))} className="bg-transparent outline-none text-[11px] font-black text-emerald-100 uppercase">
          {KEY_OPTIONS.map((option) => <option key={option.offset} value={option.offset} className="bg-[#0f172a]">{option.name} Key</option>)}
        </select>
      </div>
    </div>
  </section>
));

export default ControlPanel;
