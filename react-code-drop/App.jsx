import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import {
  Play, Square, BookOpen, Volume2, Edit3,
  Globe, RotateCcw, AlertCircle,
  Trash2, UploadCloud, Music2, Zap, CheckCircle,
  Download, FolderOpen, ChevronRight, Keyboard, ListX, Music, Clock
} from 'lucide-react';

// ==================== Firebase 嚴格單例初始化 ====================
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'genshin-lyre-studio';
try {
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
  if (firebaseConfig) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (error) { console.warn("Firebase Init Error", error); }

// ==================== 核心常數與 O(1) 靜態映射表 ====================
const NOTES_MAP = [
  { label: "高音 (點在上)", sub: "High", keys: [ { n: 'C5', k: 'q', f: 523.25 }, { n: 'D5', k: 'w', f: 587.33 }, { n: 'E5', k: 'e', f: 659.25 }, { n: 'F5', k: 'r', f: 698.46 }, { n: 'G5', k: 't', f: 783.99 }, { n: 'A5', k: 'y', f: 880.00 }, { n: 'B5', k: 'u', f: 987.77 } ]},
  { label: "中音 (無點)", sub: "Mid", keys: [ { n: 'C4', k: 'a', f: 261.63 }, { n: 'D4', k: 's', f: 293.66 }, { n: 'E4', k: 'd', f: 329.63 }, { n: 'F4', k: 'f', f: 349.23 }, { n: 'G4', k: 'g', f: 392.00 }, { n: 'A4', k: 'h', f: 440.00 }, { n: 'B4', k: 'j', f: 493.88 } ]},
  { label: "低音 (點在下)", sub: "Low", keys: [ { n: 'C3', k: 'z', f: 130.81 }, { n: 'D3', k: 'x', f: 146.83 }, { n: 'E3', k: 'c', f: 164.81 }, { n: 'F3', k: 'v', f: 174.61 }, { n: 'G3', k: 'b', f: 196.00 }, { n: 'A3', k: 'n', f: 220.00 }, { n: 'B3', k: 'm', f: 246.94 } ]}
];

const SOLFEGE_MAP = { 'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si' };
const getSolfege = (noteName) => SOLFEGE_MAP[noteName.charAt(0)] || noteName;

const ALL_KEYS_FLAT = NOTES_MAP.flatMap(r => r.keys);
const KEY_INFO_MAP = Object.fromEntries(ALL_KEYS_FLAT.map(k => [k.k, k]));
const KEY_OPTIONS = [ { name: 'C', offset: 0 }, { name: 'C#', offset: 1 }, { name: 'D', offset: 2 }, { name: 'D#', offset: 3 }, { name: 'E', offset: 4 }, { name: 'F', offset: 5 }, { name: 'F#', offset: 6 }, { name: 'G', offset: 7 }, { name: 'G#', offset: 8 }, { name: 'A', offset: 9 }, { name: 'A#', offset: 10 }, { name: 'B', offset: 11 } ];

const CHAR_TO_KEY_MAP = {
  'q':'q', 'w':'w', 'e':'e', 'r':'r', 't':'t', 'y':'y', 'u':'u',
  'a':'a', 's':'s', 'd':'d', 'f':'f', 'g':'g', 'h':'h', 'j':'j',
  'z':'z', 'x':'x', 'c':'c', 'v':'v', 'b':'b', 'n':'n', 'm':'m',
  '1':'a', '2':'s', '3':'d', '4':'f', '5':'g', '6':'h', '7':'j',
  '+1':'q', '+2':'w', '+3':'e', '+4':'r', '+5':'t', '+6':'y', '+7':'u',
  '-1':'z', '-2':'x', '-3':'c', '-4':'v', '-5':'b', '-6':'n', '-7':'m',
  '＋1':'q', '＋2':'w', '＋3':'e', '＋4':'r', '＋5':'t', '＋6':'y', '＋7':'u',
  '－1':'z', '－2':'x', '－3':'c', '－4':'v', '－5':'b', '－6':'n', '－7':'m',
};

const SEMITONE_RATIOS = new Float32Array(60);
for (let i = -30; i <= 30; i++) SEMITONE_RATIOS[i + 30] = Math.pow(2, i / 12);

const DEFAULT_SCORE = `(VA) / M / (MG) /(AG) Q /
(BAQ) G /G (MD) /D (MS) /(AD) S /
(NAD) S / M / M /A /
(ZA) /A B / B /A /

(VA) / M / (MG) /(AG) Q /
(BAQ) Q /Q (MQ) /Q (MQ) /(AQ) Q /
(NAW) / M / M /A /
(ZBA) /D / / /

(VA) / M / (MG) /(AG) Q /
(BAQ) G /G (MD) /D (MS) /(AD) S /
(NAD) / (MG) /D M /A S /
(ZAS) / (BD) /A B /Z /

(VA) / M / (MJ) /(AJ) Q /
(BAQ) Q /Q (MW) /W M /A /
(NA) / M / M /A /
(ZBA) /D / /Q /
(VA) /(VAQ) W /(VAW) /(VA) Q /
(BSQ) W /(BSW) /(BSW) /(BSQ) Q /
(NDT) T /(NDT) T /(NDT) /(NDQ) Q /
(ND) Q /(NDQ) W /(NDW) /(BSQ) /

(VA) /(VA) /(VA) Q /(VAQ) Q /
(BST) T /(BST) T /(BST) /(BSQ) Q /
(NDH) /(ND) /(ND) /(NDG) /
(NDT) T /(NDT) T /(NDT) /(BSQ) /

(VA) /(VAQ) W /(VAW) /(VA) Q /
(BSQ) W /(BSW) /(BSW) /(BSQ) Q /
(NDT) T /(NDT) T /(NDT) /(ND) Y /
(ND) T /(NDT) T /(NDW) /(BSQ) W /

(XN) /(XN) /(XN) Q /(XNQ) /
(CBS) D /(CB) S /(CBA) /(CB) /
(ZV) /(ZV) /(ZV) /(ZV) /
(ZVN) (ZVN) /(ZVN) G /Q Q / Q /
(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/J (ZQ) /(AG) Q /
(CN) G /(ADQ) QN/Q (NQ) /(ADQ) W /
(XBW) E /(SGQ) GB/Q (BQ) /(SG) Q /

(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/Q (ZQ) /(AGQ) Q /
(CN) G /(ADQ) N/Q (NQ) /(ADQ) W /
(XBW) /(SGQ) QB/E (BT) /(SGE) W /

(VAW) Q /Q (VAW) /Q /(VA) /
(ZB) / (ZBW) /E /(ZBW) /
(CNW) / (CNE) /W /(CN) /
(XB) /Q (XBQ) /E T /(XBE) W /

(VAW) Q /Q (VAW) /Q /(VAG) Q /
(ZB) G /Q (ZBG) /Q Q /(ZBG) Q /
(CN) G /Q (CN) /Q Q /(CNQ) W /
(XBW) E /Q (XB) / /(XB) /

(BSQ) T / E/W / /
(CND) / / / /
(VA) /(VA) M /(VA) (MG) /(VAG) Q /
(BAQ) G /(BAG) D /(BAD) S /(BAD) S /
(NAD) S /(NA) M /(NA) M /(NA) /
(NA) /(NA) B /(NA) B /(NA) /

(VA) /(VA) M /(VA) (MG) /(VAG) Q /
(BSQ) Q /(BSQ) Q /(BSQ) Q /(BSQ) W /
(NDW) /(ND) M /(ND) (MQ) /(NADH) /
(ND) /(ND) B /(ND) (BG) /(NADQ) /

(ZVH) /(ZV) G /(ZV) G /(ZVG) Q /
(XBQ) G /(XBG) D /(XBD) S /(XBD) S /
(CND) /(CN) G /(CND) /(CN) S /
(CNS) /(CN) D /(CNA) /B /

(XN) /(XN) /(XN) G /(XNG) G /
(CBG) G /(CBG) G /(CBQ) W /(CBQ) /
(ZVA) S /(ZVA) /(ZVQ) W /(ZVQ) /
(ZVN) (ZVN) /(ZVN) G /Q Q / Q /
(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/J (ZQ) /(AG) Q /
(CN) G /(ADQ) QN/Q (NQ) /(ADQ) W /
(XBW) E /(SGQ) GB/Q (BQ) /(SG) Q /

(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/Q (ZQ) /(AGQ) Q /
(CN) G /(ADQ) N/Q (NQ) /(ADQ) W /
(XBW) /(SGQ) QB/E (BT) /(SGE) W /

(VAW) Q /Q (VAW) /Q /(VA) /
(ZB) / (ZBW) /E /(ZBW) /
(CNW) / (CNE) /W /(CN) /
(XB) /Q (XBQ) /E T /(XBE) W /

(VAW) Q /Q (VAW) /Q /(VAG) Q /
(ZB) G /Q (ZBG) /Q Q /(ZBG) Q /
(CN) G /Q (CN) /Q Q /(CNQ) W /
(XBW) E /Q (XB) / /(XBQ) /`;

const DEFAULT_SCORE_PARAMS = { bpm: 90, timeSigNum: 4, timeSigDen: 4, charResolution: 8, globalKeyOffset: 0, accidentals: {}, tone: 'piano', reverb: true };

function mapKey(char) {
  if (!char) return null;
  return CHAR_TO_KEY_MAP[char.toLowerCase()] || null;
}

const toggleKeyDOM = (keyK, isActive) => {
  const el = document.getElementById(`key-${keyK}`);
  if (el) {
    if (isActive) el.classList.add('playing-active');
    else el.classList.remove('playing-active');
  }
};

const createRippleDOM = (keyK) => {
  const container = document.getElementById(`key-container-${keyK}`);
  if (!container) return;
  const ripple = document.createElement('div');
  ripple.className = "absolute inset-0 rounded-full border-2 border-emerald-400/60 animate-ping pointer-events-none";
  container.appendChild(ripple);
  setTimeout(() => { if (container.contains(ripple)) container.removeChild(ripple); }, 800);
};

const WIND_PARTICLE_STYLES = Array.from({ length: 15 }, () => ({
  left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
  fontSize: `${Math.random() * 20 + 10}px`, animation: `float ${Math.random() * 10 + 5}s linear infinite`
}));

const WindParticles = memo(() => (
  <>
    {WIND_PARTICLE_STYLES.map((style, i) => (
      <div key={i} className="absolute pointer-events-none opacity-20 text-emerald-300/30 select-none" style={style}></div>
    ))}
  </>
));

const PianoKey = memo(({ keyInfo, isSharp, globalOffset, onActivate, onDeactivate, onToggleSharp }) => {
  const totalOffset = globalOffset + (isSharp ? 1 : 0);
  const displayOffset = totalOffset !== 0 ? (Math.abs(totalOffset) <= 2 ? (totalOffset > 0 ? '♯' : '♭').repeat(Math.abs(totalOffset)) : `${totalOffset > 0 ? '♯' : '♭'}${Math.abs(totalOffset)}`) : null;

  const handleToggle = useCallback((e) => { e.stopPropagation(); onToggleSharp(keyInfo.k); }, [onToggleSharp, keyInfo.k]);
  const handleDown = useCallback((e) => { e.preventDefault(); onActivate(keyInfo.k); }, [onActivate, keyInfo.k]);
  const handleUp = useCallback((e) => { e.preventDefault(); onDeactivate(keyInfo.k); }, [onDeactivate, keyInfo.k]);

  return (
    <div id={`key-container-${keyInfo.k}`} className="relative group key-wrapper">
      <button onClick={handleToggle} className={`absolute -top-1 -right-1 md:-top-2 md:-right-2 w-5 h-5 md:w-6 md:h-6 rounded-full text-[8px] md:text-[9px] font-black z-30 transition-all border flex items-center justify-center ${isSharp ? 'bg-amber-400 text-amber-950 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.4)] scale-110' : 'bg-white/5 text-white/20 border-white/5 hover:bg-white/10 group-hover:text-white/40'}`}>#</button>
      <button id={`key-${keyInfo.k}`} onPointerDown={handleDown} onPointerUp={handleUp} onPointerLeave={handleUp} className="w-12 h-12 sm:w-14 sm:h-14 md:w-20 md:h-20 rounded-full flex flex-col items-center justify-center transition-all duration-150 relative touch-none bg-white/[0.03] border border-white/10 hover:border-emerald-400/40 hover:bg-white/[0.07] hover:-translate-y-1">
        <span className="text-lg sm:text-xl md:text-2xl font-black tracking-tighter transition-colors flex items-start text-emerald-50/90">{getSolfege(keyInfo.n)}{displayOffset && <sup className="text-[9px] sm:text-[10px] ml-0.5 text-amber-400">{displayOffset}</sup>}</span>
        <span className="text-[10px] md:text-[11px] font-mono font-bold mt-1 uppercase tracking-widest text-emerald-300/80">{keyInfo.k}</span>
      </button>
    </div>
  );
});

const AppHeader = memo(({ playHotkey, setPlayHotkey, isPlaying, onTogglePlay }) => (
  <header className="z-30 w-full max-w-6xl mt-8 px-6 flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02] backdrop-blur-sm p-6 rounded-[30px] border border-white/5 shadow-xl">
    <div className="flex items-center gap-5">
      <div className="bg-emerald-500/20 p-3 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]"><Music2 className="text-emerald-400" size={28} /></div>
      <div><h1 className="text-2xl md:text-3xl font-black tracking-tight text-emerald-100">風物之詩琴 <span className="text-emerald-500 italic ml-1">Studio</span></h1><p className="text-[9px] tracking-[0.4em] uppercase opacity-30 font-sans mt-0.5">Pro DAW Theory Engine • v25.0</p></div>
    </div>
    <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
      <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/5">
        <Keyboard size={14} className="text-emerald-400/50" />
        <select value={playHotkey} onChange={e => setPlayHotkey(e.target.value)} className="bg-transparent outline-none text-xs text-emerald-100/70 cursor-pointer">
          <option value="Space" className="bg-[#0f172a]">快捷鍵: Space</option><option value="Enter" className="bg-[#0f172a]">快捷鍵: Enter</option><option value="None" className="bg-[#0f172a]">停用快捷鍵</option>
        </select>
      </div>
      <button onClick={onTogglePlay} className={`flex items-center justify-center gap-4 px-10 py-3.5 rounded-full font-black text-sm tracking-[0.2em] transition-all transform active:scale-95 shadow-2xl w-full md:w-auto ${isPlaying ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/40'}`}>
        {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />} {isPlaying ? '停止演奏' : '啟動腳本演奏'}
      </button>
    </div>
  </header>
));

const KeyboardPanel = memo(({ accidentals, globalKeyOffset, onKeyActivate, onKeyDeactivate, onToggleSharp, progressBarRef }) => (
  <main className="z-20 w-full max-w-6xl mt-10 relative px-4">
    <div className="bg-gradient-to-br from-emerald-950/30 to-black/80 backdrop-blur-3xl border border-white/5 rounded-[60px] p-8 md:p-14 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
        <div ref={progressBarRef} className="h-full bg-gradient-to-r from-emerald-600 via-emerald-300 to-teal-400 will-change-transform" style={{ width: '0%', transition: 'width 16ms linear' }} />
      </div>
      {NOTES_MAP.map((row, ridx) => (
        <div key={ridx} className="flex flex-col md:flex-row items-center gap-4 md:gap-10 mb-10 last:mb-0">
          <div className="w-full md:w-24 text-center md:text-right flex flex-col items-center md:items-end justify-center">
            <span className="text-[10px] text-emerald-400/80 font-black mb-1">{row.label}</span>
            <span className="text-[8px] uppercase tracking-widest opacity-30 font-bold border border-white/10 px-2 py-0.5 rounded-full">{row.sub}</span>
          </div>
          <div className="flex-1 flex justify-center gap-3 md:gap-7 flex-wrap md:flex-nowrap">
            {row.keys.map(key => (
              <PianoKey
                key={key.k} keyInfo={key}
                isSharp={!!accidentals[key.k]} globalOffset={globalKeyOffset}
                onActivate={onKeyActivate} onDeactivate={onKeyDeactivate} onToggleSharp={onToggleSharp}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </main>
));

const ControlPanel = memo(({ bpm, setBpm, timeSigNum, setTimeSigNum, timeSigDen, setTimeSigDen, charResolution, setCharResolution, vol, setVol, tone, setTone, reverb, onToggleReverb, globalKeyOffset, setGlobalKeyOffset }) => (
  <section className="z-30 w-full max-w-6xl my-10 flex flex-col gap-4 px-6">
    <div className="flex flex-wrap justify-center items-center gap-4">
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md shadow-inner" title="調整整體演奏速度">
        <Zap size={15} className="text-amber-400 shrink-0" />
        <input type="range" min="20" max="300" step="1" value={Number(bpm) || 20} onChange={e => setBpm(Number(e.target.value))} className="hidden sm:block w-20 md:w-24 accent-amber-400" />
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5 focus-within:border-amber-500/50 transition-colors">
          <button onClick={() => setBpm(b => Math.max(20, (Number(b) || 77) - 1))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-md text-amber-400/80 hover:text-amber-400 transition-colors text-lg leading-none">-</button>
          <input type="number" value={bpm} onChange={e => setBpm(e.target.value === '' ? '' : Number(e.target.value))} onBlur={() => { let v = Number(bpm); if (!v || v < 20) setBpm(20); else if (v > 300) setBpm(300); }} className="w-10 bg-transparent text-center text-xs font-mono text-emerald-100 outline-none no-spinners" />
          <button onClick={() => setBpm(b => Math.min(300, (Number(b) || 77) + 1))} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-md text-amber-400/80 hover:text-amber-400 transition-colors text-lg leading-none">+</button>
        </div>
        <span className="opacity-30 text-[9px] font-mono tracking-widest shrink-0 ml-1">BPM</span>
      </div>
      <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Clock size={15} className="text-emerald-400 shrink-0" />
        <span className="text-[10px] font-black text-emerald-200/70 uppercase tracking-widest mr-1 hidden sm:inline">拍號</span>
        <select value={timeSigNum} onChange={e=>setTimeSigNum(Number(e.target.value))} className="bg-transparent outline-none text-sm text-emerald-400 font-black cursor-pointer appearance-none text-center">
          {[2,3,4,5,6,7,8,9,12].map(n => <option key={n} value={n} className="bg-slate-900">{n}</option>)}
        </select>
        <span className="text-emerald-500/50 font-bold mx-0.5">/</span>
        <select value={timeSigDen} onChange={e=>setTimeSigDen(Number(e.target.value))} className="bg-transparent outline-none text-sm text-emerald-400 font-black cursor-pointer appearance-none text-center">
          {[2,4,8,16].map(n => <option key={n} value={n} className="bg-slate-900">{n}</option>)}
        </select>
        <div className="w-px h-4 bg-emerald-500/30 mx-2 md:mx-3"></div>
        <span className="text-[10px] font-black text-emerald-200/70 uppercase tracking-widest mr-1 md:mr-2">1字元=</span>
        <select value={charResolution} onChange={e=>setCharResolution(Number(e.target.value))} className="bg-transparent outline-none text-[11px] text-emerald-400 font-black cursor-pointer">
          <option value={4} className="bg-slate-900">4分音符</option>
          <option value={8} className="bg-slate-900">8分音符</option>
          <option value={16} className="bg-slate-900">16分音符</option>
          <option value={32} className="bg-slate-900">32分音符</option>
        </select>
      </div>
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Volume2 size={15} className="text-emerald-400" /><input type="range" min="0" max="1" step="0.01" value={vol} onChange={e => setVol(Number(e.target.value))} className="w-20 md:w-24 accent-emerald-400" />
      </div>
    </div>
    <div className="flex flex-wrap justify-center items-center gap-4">
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Music size={15} className="text-pink-400" />
        <select value={tone} onChange={e => setTone(e.target.value)} className="bg-transparent outline-none text-[11px] font-black text-emerald-100 uppercase cursor-pointer">
          <option value="piano" className="bg-[#0f172a]">鋼琴 (Piano)</option>
          <option value="flute" className="bg-[#0f172a]">笛子 (Flute)</option>
          <option value="tongue-drum" className="bg-[#0f172a]">空靈鼓 (Steel Tongue)</option>
          <option value="lyre-long" className="bg-[#0f172a]">風物之詩琴 (長殘響)</option>
          <option value="lyre-short" className="bg-[#0f172a]">風物之詩琴 (短促音)</option>
          <option value="classic" className="bg-[#0f172a]">經典電子音 (三角波)</option>
        </select>
      </div>
      <button onClick={onToggleReverb} className={`px-6 py-2.5 rounded-full border transition-all text-[10px] font-black tracking-widest ${reverb ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-white/5 text-white/20 border-white/10'}`}>REVERB <span className="ml-1 opacity-30">{reverb ? 'ON' : 'OFF'}</span></button>
      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-full px-5 py-2.5 backdrop-blur-md">
        <Globe size={15} className="text-indigo-400" /><select value={globalKeyOffset} onChange={e => setGlobalKeyOffset(Number(e.target.value))} className="bg-transparent outline-none text-[11px] font-black text-emerald-100 uppercase">{KEY_OPTIONS.map(opt => <option key={opt.offset} value={opt.offset} className="bg-[#0f172a]">{opt.name} Key</option>)}</select>
      </div>
    </div>
  </section>
));

const ScoreLibrary = memo(({ user, savedScores, onLoadScore, onClearAll, onDeleteScore }) => (
  <div className="bg-black/40 border border-white/5 rounded-[40px] p-6 flex flex-col h-fit max-h-[500px] backdrop-blur-sm shadow-inner relative">
    {!user && <div className="absolute inset-0 bg-black/60 rounded-[40px] backdrop-blur-md z-10 flex items-center justify-center text-xs text-white/50 font-bold tracking-widest">離線模式</div>}
    <div className="flex items-center justify-between mb-6 px-2">
      <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] tracking-[0.2em] uppercase"><UploadCloud size={16} /> 雲端樂譜庫 <span className="text-[8px] opacity-50 ml-1">(點擊即可開檔)</span></div>
      <button onClick={onClearAll} className="text-rose-400/50 hover:text-rose-400 transition-colors p-1" title="清空琴譜庫"><ListX size={14}/></button>
    </div>
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
      {savedScores.length === 0 ? <div className="text-center py-20 opacity-10 text-[10px] uppercase tracking-widest">Library Empty</div> : savedScores.map(s => (
        <div key={s.id} onClick={() => onLoadScore(s)} className="group bg-white/[0.03] p-4 rounded-3xl border border-white/10 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all relative flex items-center justify-between cursor-pointer">
          <div className="flex-1 overflow-hidden pr-2">
            <div className="text-sm font-bold text-emerald-50 truncate">{s.title === s.id ? s.title : s.id}</div>
            <div className="text-[9px] opacity-40 mt-1 flex gap-2 uppercase tracking-wider">
              <span>{new Date((s.updatedAt?.seconds ?? Date.now() / 1000) * 1000).toLocaleDateString('zh-TW', {year:'numeric', month:'short', day:'numeric'})}</span>
              {s.bpm && <span className="text-emerald-300">bpm:{s.bpm}</span>}
              {s.tone && <span className="text-amber-300">{s.tone}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 transition-opacity">
            <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-md" title="載入此雲端樂譜"><FolderOpen size={16} /></div>
            <button onClick={(e) => { e.stopPropagation(); onDeleteScore(s.id); }} className="p-2 text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/20 rounded-xl transition-all" title="刪除"><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  </div>
));

const ScoreEditor = memo(({ score, setScore, scoreTitle, setScoreTitle, onImport, onExport, onSave, onReset, isSaving }) => {
  const fileInputRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col shadow-2xl relative">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="w-full sm:flex-1 min-w-[200px] flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 focus-within:border-emerald-500/40">
          <Edit3 size={18} className="text-emerald-400" /><input value={scoreTitle} onChange={e => setScoreTitle(e.target.value)} className="bg-transparent outline-none flex-1 text-sm font-bold text-emerald-50" placeholder="腳本名稱..." />
        </div>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <input type="file" accept=".txt" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="開檔 (可多選匯入 .txt 檔案)"><FolderOpen size={18} /></button>
          <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="存檔 (下載為 .txt 檔案並包含節奏與音色設定)"><Download size={18} /></button>
          <button onClick={onSave} disabled={isSaving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2"><UploadCloud size={16} /> {isSaving ? 'SYNC' : 'CLOUD'}</button>
          <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="重置為預設樂譜"><RotateCcw size={18}/></button>
        </div>
      </div>

      <div className="bg-black/30 rounded-3xl border border-white/5 mb-6 overflow-hidden transition-all">
        <button onClick={() => setShowGuide(g => !g)} className="w-full px-5 py-4 flex items-center justify-between text-emerald-400 hover:bg-white/[0.02] transition-colors outline-none">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase"><BookOpen size={14} /> 空白節奏引擎與排版教學</div>
          <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
        </button>
        {showGuide && (
          <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-white/60 bg-black/20 animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-100/80 leading-relaxed space-y-3 border-l-2 border-emerald-500 pl-4 md:col-span-2">
              <p><b className="text-emerald-300"> 還原純淨空白控制：</b>已移除不直覺的小數點控制，節奏再次 100% 交由您的「空白鍵」來決定！</p>
              <p><b className="text-emerald-300">⏱️ 無縫換行技術：</b>系統現在會自動過濾每行結尾「看不見的多餘空白」，您隨意換行都不會再導致節奏卡頓錯亂！</p>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1"> 排版邏輯拆解</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">單字</span>
                  <div><b className="text-emerald-200">單一音符</b><br/>連續寫 (如 QWE) 代表不間斷連續彈奏。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">( )</span>
                  <div><b className="text-emerald-200">和弦 / 同時彈奏</b><br/>括號內記號同時發聲（具備微弱撥弦延遲）。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">空白</span>
                  <div><b className="text-emerald-200">休止符 / 停頓</b><br/>一個空白代表一個單位的停頓。</div>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1"> 鍵盤對照表</h4>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 font-mono mt-4">
                <span className="text-emerald-500">高音 (+號):</span> <span>+1 +2 +3 +4 +5 +6 +7 <br/><span className="text-emerald-200/50 text-[9px] tracking-widest">(Q W E R T Y U)</span></span>
                <span className="text-emerald-500">中音 (無號):</span> <span>1  2  3  4  5  6  7 <br/><span className="text-emerald-200/50 text-[9px] tracking-widest">(A S D F G H J)</span></span>
                <span className="text-emerald-500">低音 (-號):</span> <span>-1 -2 -3 -4 -5 -6 -7 <br/><span className="text-emerald-200/50 text-[9px] tracking-widest">(Z X C V B N M)</span></span>
              </div>
              <p className="mt-3 text-[10px] text-emerald-200/70 border-t border-white/5 pt-2">
                 <b>小提示：</b>數字與字母支援無縫混用！例如 <b>(-47)+1</b> 等同於 <b>(VJ)Q</b>。
              </p>
            </div>
          </div>
        )}
      </div>
      <textarea value={score} onChange={e=>setScore(e.target.value)} spellCheck={false} className="flex-1 min-h-[300px] md:min-h-[350px] bg-black/50 border border-white/5 rounded-3xl p-5 md:p-6 text-xs font-mono leading-relaxed outline-none text-emerald-100/60 custom-scrollbar shadow-inner focus:border-emerald-500/20" />
    </div>
  );
});

function useAudioEngine() {
  const audioCtx = useRef(null);
  const masterGain = useRef(null);
  const reverbBus = useRef(null);
  const activeVoices = useRef([]);
  const noiseBufferRef = useRef(null);
  const shortNoiseBufferRef = useRef(null);

  const settingsRef = useRef({ vol: 0.65, reverb: true, globalOffset: 0, accidentals: {}, tone: 'piano' });

  useEffect(() => {
    return () => {
      if (audioCtx.current && audioCtx.current.state !== 'closed') audioCtx.current.close().catch(console.error);
    };
  }, []);

  const updateSettings = useCallback((newSettings) => {
    settingsRef.current = { ...settingsRef.current, ...newSettings };
    if (masterGain.current && audioCtx.current) masterGain.current.gain.setTargetAtTime(settingsRef.current.vol, audioCtx.current.currentTime, 0.05);
    if (reverbBus.current && audioCtx.current) reverbBus.current.gain.setTargetAtTime(settingsRef.current.reverb ? 0.45 : 0, audioCtx.current.currentTime, 0.1);
  }, []);

  const setupAudio = useCallback(async () => {
    if (!audioCtx.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ac = new Ctx(); audioCtx.current = ac;

      const gain = ac.createGain(); gain.gain.value = settingsRef.current.vol; masterGain.current = gain;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -6; comp.knee.value = 5; comp.ratio.value = 20; comp.attack.value = 0.005; comp.release.value = 0.1;

      const rev = ac.createGain(); rev.gain.value = settingsRef.current.reverb ? 0.45 : 0; reverbBus.current = rev;
      const delay = ac.createDelay(); delay.delayTime.value = 0.15;
      const fb = ac.createGain(); fb.gain.value = 0.15;
      const filter = ac.createBiquadFilter(); filter.frequency.value = 1500;

      rev.connect(delay); delay.connect(fb); fb.connect(filter); filter.connect(delay); filter.connect(comp);
      gain.connect(comp); gain.connect(rev); comp.connect(ac.destination);

      const buf1 = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.06), ac.sampleRate);
      const data1 = buf1.getChannelData(0);
      for (let i = 0; i < data1.length; i++) data1[i] = (Math.random() * 2 - 1) * (1 - i / data1.length);
      noiseBufferRef.current = buf1;

      const buf2 = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.015), ac.sampleRate);
      const data2 = buf2.getChannelData(0);
      for (let i = 0; i < data2.length; i++) data2[i] = (Math.random() * 2 - 1) * 0.08;
      shortNoiseBufferRef.current = buf2;
    }
    if (audioCtx.current.state === 'suspended') {
      try { await audioCtx.current.resume(); } catch (e) { console.warn("AudioContext resume failed", e); }
    }
  }, []);

  const getToneConfig = useCallback((tone, durationSec) => {
    const baseDur = durationSec !== null ? durationSec : 0.5;
    switch (tone) {
      case 'piano':
        return { type: 'sawtooth', dur: 3.5, atk: 0.01, dec: 0.8, sus: 0.1, pk: 0.6, flt: true, fltStartMult: 5.0, fltEndMult: 1.0, fltDec: 0.2, nBuf: null };
      case 'flute':
        return { type: 'sine', dur: 2.5, atk: 0.08, dec: 0.2, sus: 0.8, pk: 0.7, flt: false, nBuf: noiseBufferRef.current, nDur: 0.8, nVol: 0.015 };
      case 'lyre-long':
      case 'lyre':
        return { type: 'sawtooth', dur: 4.0, atk: 0.015, dec: 0.6, sus: 0.1, pk: 0.4, flt: true, fltStartMult: 6, fltEndMult: 1.2, fltDec: 0.4, nBuf: noiseBufferRef.current, nDur: 0.05, nVol: 0.08 };
      case 'lyre-short':
        return { type: 'sawtooth', dur: Math.max(baseDur * 2.0, 0.8), atk: 0.015, dec: 0.1, sus: 0.001, pk: 0.4, flt: true, fltStartMult: 6, fltEndMult: 1.2, fltDec: 0.3, nBuf: noiseBufferRef.current, nDur: 0.06, nVol: 0.1 };
      case 'tongue-drum':
        return { type: 'triangle', dur: 3.0, atk: 0.02, dec: 0.5, sus: 0.2, pk: 0.6, flt: true, fltStartMult: 3.0, fltEndMult: 1.0, fltDec: 0.6, nBuf: noiseBufferRef.current, nDur: 0.03, nVol: 0.05 };
      default:
        return { type: 'triangle', dur: Math.max(baseDur * 1.5, 0.6), atk: 0.015, dec: 0.1, sus: 0.001, pk: 0.4, flt: false, nBuf: shortNoiseBufferRef.current, nDur: 0.015, nVol: 0.15 };
    }
  }, []);

  const triggerNote = useCallback((keyInfo, velocity = 0.8, absoluteTime = null, durationSec = null) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    let startTime = absoluteTime !== null ? absoluteTime : now;
    if (startTime < now) startTime = now + 0.005;

    activeVoices.current = activeVoices.current.filter((v) => {
      if (v.key === keyInfo.k && v.endTime > startTime) {
        const fadeStart = Math.max(now, startTime - 0.03);
        try {
          v.g.gain.cancelScheduledValues(fadeStart);
          v.g.gain.setTargetAtTime(0, fadeStart, 0.01);
          v.osc.stop(fadeStart + 0.05);
        } catch (e) {}
        return false;
      }
      return true;
    });

    if (activeVoices.current.length > 48) {
      activeVoices.current.sort((a, b) => a.endTime - b.endTime);
      const toKill = activeVoices.current.splice(0, activeVoices.current.length - 48);
      toKill.forEach(v => {
        try {
          const killTime = Math.max(now, now + 0.015);
          v.g.gain.cancelScheduledValues(killTime);
          v.g.gain.setTargetAtTime(0, killTime, 0.01);
          v.osc.stop(killTime + 0.05);
        } catch (e) {}
      });
    }

    const { globalOffset, accidentals, tone } = settingsRef.current;
    const freqRatio = SEMITONE_RATIOS[globalOffset + (accidentals[keyInfo.k] || 0) + 30];
    const freq = keyInfo.f * freqRatio;
    const keyGainMod = Math.min(1.0, 800 / (freq + 200));

    const conf = getToneConfig(tone, durationSec);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const finalPeak = velocity * conf.pk * keyGainMod;

    osc.type = conf.type;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(finalPeak, startTime + conf.atk);
    g.gain.exponentialRampToValueAtTime(Math.max(finalPeak * conf.sus, 0.001), startTime + conf.dec);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + conf.dur);

    osc.frequency.setValueAtTime(freq, startTime);

    let filter = null;
    if (conf.flt) {
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * conf.fltStartMult, 20000), startTime);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq * conf.fltEndMult, 100), startTime + conf.fltDec);
    }

    let noise = null, noiseGain = null;
    if (conf.nBuf) {
      noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, startTime);
      noiseGain.gain.linearRampToValueAtTime(conf.nVol * velocity, startTime + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + conf.nDur);
      noise = ctx.createBufferSource(); noise.buffer = conf.nBuf;
    }

    if (conf.flt) {
      osc.connect(filter);
      if (noise) noise.connect(noiseGain).connect(filter);
      filter.connect(g);
    } else {
      osc.connect(g);
      if (noise) noise.connect(noiseGain).connect(g);
    }

    g.connect(masterGain.current);
    osc.start(startTime); if (noise) noise.start(startTime);

    const endTime = startTime + conf.dur;
    osc.stop(endTime);

    const voiceObj = { key: keyInfo.k, osc, g, filter, endTime };
    activeVoices.current.push(voiceObj);

    const teardownDelay = (conf.dur + 0.1) * 1000;
    setTimeout(() => {
      activeVoices.current = activeVoices.current.filter(v => v !== voiceObj);
      try { osc.disconnect(); if (filter) filter.disconnect(); g.disconnect(); if (noise) noise.disconnect(); } catch (e) {}
      voiceObj.osc = null; voiceObj.g = null; voiceObj.filter = null;
    }, teardownDelay);

  }, [getToneConfig]);

  const stopAllNodes = useCallback(() => {
    activeVoices.current.forEach(v => {
      try {
        v.g.gain.cancelScheduledValues(audioCtx.current.currentTime);
        v.g.gain.setTargetAtTime(0, audioCtx.current.currentTime, 0.015);
        v.osc.stop(audioCtx.current.currentTime + 0.08);
        setTimeout(() => { try { v.osc.disconnect(); v.g.disconnect(); } catch (e) {} }, 100);
      } catch (e) {}
    });
    activeVoices.current = [];
  }, []);

  return { audioCtx, setupAudio, triggerNote, stopAllNodes, updateSettings };
}

export default function App() {
  const [vol, setVol] = useState(0.65);
  const [reverb, setReverb] = useState(true);
  const [globalKeyOffset, setGlobalKeyOffset] = useState(0);
  const [accidentals, setAccidentals] = useState({});
  const [tone, setTone] = useState(DEFAULT_SCORE_PARAMS.tone);
  const [score, setScore] = useState(DEFAULT_SCORE);
  const [scoreTitle, setScoreTitle] = useState("我永遠想待在你的房子裡");
  const [savedScores, setSavedScores] = useState([]);
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_SCORE_PARAMS.bpm);
  const [timeSigNum, setTimeSigNum] = useState(DEFAULT_SCORE_PARAMS.timeSigNum);
  const [timeSigDen, setTimeSigDen] = useState(DEFAULT_SCORE_PARAMS.timeSigDen);
  const [charResolution, setCharResolution] = useState(DEFAULT_SCORE_PARAMS.charResolution);
  const [playHotkey, setPlayHotkey] = useState('Space');

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const progressBarRef = useRef(null);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const { audioCtx, setupAudio, triggerNote, stopAllNodes, updateSettings } = useAudioEngine();
  const schedulerTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const scoreRef = useRef(score);

  const actionRefs = useRef({ triggerNote: null, playScoreAction: null });
  const hotkeyRef = useRef(playHotkey);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { hotkeyRef.current = playHotkey; }, [playHotkey]);

  const stopAll = useCallback(() => {
    if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
    if (visualTimerRef.current) cancelAnimationFrame(visualTimerRef.current);
    schedulerTimerRef.current = null;
    visualTimerRef.current = null;

    stopAllNodes();
    setIsPlaying(false);
    isPlayingRef.current = false;

    document.querySelectorAll('.playing-active').forEach(el => el.classList.remove('playing-active'));
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, [stopAllNodes]);

  useEffect(() => { return () => stopAll(); }, [stopAll]);

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const loadScore = useCallback((s) => {
    setScore(s.content);
    setScoreTitle(s.title);
    setBpm(s.bpm ?? DEFAULT_SCORE_PARAMS.bpm);
    setTimeSigNum(s.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum);
    setTimeSigDen(s.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen);
    setCharResolution(s.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution);
    setGlobalKeyOffset(s.globalKeyOffset ?? 0);
    setAccidentals(s.accidentals ?? {});
    setTone(s.tone ?? DEFAULT_SCORE_PARAMS.tone);
    setReverb(s.reverb ?? true);
    stopAll();
    showToast(`已載入樂章：${s.title} (並套用其參數設定)`, "success");
  }, [stopAll, showToast]);

  const currentScoreParams = useMemo(() => ({
    bpm: Number(bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum, timeSigDen, charResolution,
    globalKeyOffset, accidentals, tone, reverb
  }), [bpm, timeSigNum, timeSigDen, charResolution, globalKeyOffset, accidentals, tone, reverb]);

  const handleImportLocal = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (files.length === 1) {
      const file = files[0];
      const content = await file.text();
      let finalContent = content;
      let params = {};

      const firstLine = content.split('\n')[0];
      if (firstLine.startsWith('// [META] ')) {
        try {
          params = JSON.parse(firstLine.replace('// [META] ', ''));
          finalContent = content.substring(firstLine.length + 1).replace(/^\n/, '');
        } catch (err) {}
      }

      loadScore({ title: file.name.replace(/\.[^/.]+$/, ""), content: finalContent, ...params });
    } else {
      if (!user || !db) { showToast("多檔批次匯入需處於雲端連線狀態", "error"); e.target.value = ''; return; }
      showToast(`正在批次同步 ${files.length} 份琴譜至雲端庫...`, "info");
      try {
        const uploadPromises = files.map(async (file) => {
          const content = await file.text();
          const title = file.name.replace(/\.[^/.]+$/, "");
          let finalContent = content;
          let params = {};
          const firstLine = content.split('\n')[0];
          if (firstLine.startsWith('// [META] ')) {
            try {
              params = JSON.parse(firstLine.replace('// [META] ', ''));
              finalContent = content.substring(firstLine.length + 1).replace(/^\n/, '');
            } catch (err) {}
          }
          return setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'scores', title), {
            title, content: finalContent, ...currentScoreParams, ...params, updatedAt: serverTimestamp()
          });
        });
        await Promise.all(uploadPromises);
        showToast(`成功將 ${files.length} 份琴譜建檔至雲端庫`, "success");
      } catch (err) { showToast("批次建檔過程發生錯誤", "error"); }
    }
    e.target.value = '';
  }, [user, showToast, currentScoreParams, loadScore]);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (e) {}
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    return onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'scores'), (snap) => {
      setSavedScores(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)));
    });
  }, [user]);

  useEffect(() => {
    updateSettings({ vol, reverb, globalOffset: globalKeyOffset, accidentals, tone });
  }, [vol, reverb, globalKeyOffset, accidentals, tone, updateSettings]);

  const handleSaveScore = useCallback(async () => {
    if (!user) return showToast("離線模式無法雲端存檔", "error");
    if (isSaving || !scoreTitle.trim()) return showToast("請輸入樂章名稱", "error");
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'scores', scoreTitle.trim()), {
        title: scoreTitle.trim(), content: score, ...currentScoreParams, updatedAt: serverTimestamp()
      });
      showToast("樂章已珍藏至雲端（已包含所有節奏與音色設定）", "success");
    } catch (e) { showToast("存檔失敗", "error"); } finally { setIsSaving(false); }
  }, [user, isSaving, scoreTitle, score, currentScoreParams, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    if (!user) return;
    if (window.confirm('確定刪除此樂章？')) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'scores', id)); showToast("已刪除", "success"); } catch (e) {}
    }
  }, [user, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!user || !window.confirm('確定清空所有雲端琴譜嗎？無法復原。')) return;
    try { await Promise.all(savedScores.map(s => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'scores', s.id)))); showToast("已清空琴譜庫", "success"); }
    catch (e) { showToast("清空失敗", "error"); }
  }, [user, savedScores, showToast]);

  const handleExportLocal = useCallback(() => {
    if (!score.trim()) return showToast("琴譜為空", "error");

    const meta = JSON.stringify(currentScoreParams);
    const exportContent = `// [META] ${meta}\n${score}`;

    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${scoreTitle.trim() || '未命名樂曲'}.txt`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    showToast("已下載至本機 (附帶所有參數記錄)", "success");
  }, [score, scoreTitle, currentScoreParams, showToast]);

  const handleResetScore = useCallback(() => {
    setScore(DEFAULT_SCORE);
    setBpm(DEFAULT_SCORE_PARAMS.bpm);
    setTone(DEFAULT_SCORE_PARAMS.tone);
    setCharResolution(DEFAULT_SCORE_PARAMS.charResolution);
    setGlobalKeyOffset(DEFAULT_SCORE_PARAMS.globalKeyOffset);
    setAccidentals(DEFAULT_SCORE_PARAMS.accidentals);
    setReverb(DEFAULT_SCORE_PARAMS.reverb);
    stopAll();
    showToast("已重置為預設樂章與預設參數", "success");
  }, [stopAll, showToast]);

  const parseScoreData = useCallback((txt, bpmVal, sigNum, sigDen, charRes) => {
    const events = [];
    const beatDuration = 60 / bpmVal;
    const tickDuration = beatDuration * (sigDen / charRes);

    let currentTime = 0;
    const cleanTxt = txt.replace(/\/\/.*$/gm, '');

    let i = 0;
    const len = cleanTxt.length;

    while (i < len) {
      const char = cleanTxt[i];

      if (char === '\n' || char === '\r') {
        i++;
        continue;
      }

      if (char === ' ' || char === '\t' || char === '\u3000') {
        currentTime += tickDuration;
        i++;
        continue;
      }

      if (char === '(') {
        i++;
        const bracketKeys = [];
        while (i < len && cleanTxt[i] !== ')') {
          let token = cleanTxt[i];
          if (token === ' ' || token === '\n' || token === '\r' || token === '\t') { i++; continue; }

          if ((token === '+' || token === '-' || token === '＋' || token === '－') && i + 1 < len) {
            const nextChar = cleanTxt[i + 1];
            if (nextChar >= '1' && nextChar <= '7') { token += nextChar; i++; }
          }
          const mapped = mapKey(token);
          if (mapped) bracketKeys.push(mapped);
          i++;
        }
        if (cleanTxt[i] === ')') i++;

        if (bracketKeys.length > 0) {
          bracketKeys.forEach((k, idx) => {
            events.push({ time: currentTime + (idx * 0.012), k, durationSec: tickDuration * 4, v: 0.85 });
          });
          currentTime += tickDuration;
        }
        continue;
      }

      if (char === '/') {
        const beats = currentTime / beatDuration;
        if (Math.abs(beats - Math.round(beats)) > 0.01) currentTime = Math.ceil(beats - 0.01) * beatDuration;
        i++; continue;
      }

      let token = char;
      if ((token === '+' || token === '-' || token === '＋' || token === '－') && i + 1 < len) {
        const nextChar = cleanTxt[i + 1];
        if (nextChar >= '1' && nextChar <= '7') { token += nextChar; i++; }
      }

      const mapped = mapKey(token);
      if (mapped) {
        events.push({ time: currentTime, k: mapped, durationSec: tickDuration * 4, v: 0.85 });
        currentTime += tickDuration;
      }
      i++;
    }
    return { events, beatDuration, maxTime: currentTime };
  }, []);

  const handleKeyActivate = useCallback((keyK) => {
    const doActivate = () => {
      const info = KEY_INFO_MAP[keyK];
      if (info) triggerNote(info, 0.9);
      toggleKeyDOM(keyK, true);
      createRippleDOM(keyK);
    };
    if (!audioCtx.current || audioCtx.current.state === 'suspended') setupAudio().then(doActivate);
    else doActivate();
  }, [audioCtx, setupAudio, triggerNote]);

  const handleKeyDeactivate = useCallback((keyK) => toggleKeyDOM(keyK, false), []);
  const handleToggleSharp = useCallback((k) => setAccidentals(p => ({ ...p, [k]: p[k] ? 0 : 1 })), []);
  const handleToggleReverb = useCallback(() => { setupAudio(); setReverb(r => !r); }, [setupAudio]);

  const playScoreAction = useCallback(async () => {
    if (isPlayingRef.current) { stopAll(); return; }

    isPlayingRef.current = true;
    setIsPlaying(true);

    try {
      await setupAudio();
      const currentBpm = Number(bpm) || DEFAULT_SCORE_PARAMS.bpm;
      const { events: evs, maxTime } = parseScoreData(scoreRef.current, currentBpm, timeSigNum, timeSigDen, charResolution);

      if (!evs.length) { stopAll(); return showToast("未偵測到有效音符", "error"); }

      const start = audioCtx.current.currentTime + 0.3;
      const queue = evs.map(e => ({ ...e, time: start + e.time }));
      const visualQueue = evs.map(e => ({ k: e.k, on: start + e.time }));

      let noteIndex = 0;
      let visualIndex = 0;

      const scheduleAudio = () => {
        if (!isPlayingRef.current) return;
        const cur = audioCtx.current.currentTime;
        while (noteIndex < queue.length && queue[noteIndex].time < cur + 0.5) {
          const e = queue[noteIndex++];
          const info = KEY_INFO_MAP[e.k];
          if (info) triggerNote(info, e.v, e.time, e.durationSec);
        }
        if (noteIndex < queue.length) schedulerTimerRef.current = setTimeout(scheduleAudio, 25);
      };

      const syncVisuals = () => {
        if (!isPlayingRef.current) return;
        const cur = audioCtx.current.currentTime;

        if (progressBarRef.current && maxTime > 0) {
          progressBarRef.current.style.width = `${Math.min(100, Math.max(0, ((cur - start) / maxTime) * 100))}%`;
        }

        while (visualIndex < visualQueue.length && visualQueue[visualIndex].on <= cur) {
          const v = visualQueue[visualIndex++];
          toggleKeyDOM(v.k, true);
          createRippleDOM(v.k);
          setTimeout(() => toggleKeyDOM(v.k, false), 200);
        }

        if (cur - start >= maxTime + 0.4) stopAll();
        else visualTimerRef.current = requestAnimationFrame(syncVisuals);
      };

      scheduleAudio();
      visualTimerRef.current = requestAnimationFrame(syncVisuals);

    } catch (err) {
      console.error(err);
      stopAll();
      showToast("音訊排程發生錯誤", "error");
    }
  }, [parseScoreData, bpm, timeSigNum, timeSigDen, charResolution, setupAudio, triggerNote, stopAll, showToast, audioCtx]);

  useEffect(() => {
    actionRefs.current.triggerNote = triggerNote;
    actionRefs.current.playScoreAction = playScoreAction;
  }, [triggerNote, playScoreAction]);

  useEffect(() => {
    const down = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (hotkeyRef.current !== 'None' && e.code === hotkeyRef.current) { e.preventDefault(); actionRefs.current.playScoreAction(); return; }
      if (e.repeat || isPlayingRef.current) return;

      const mappedKey = mapKey(e.key);
      if (mappedKey) {
        e.preventDefault();
        const el = document.getElementById(`key-${mappedKey}`);
        if (!el || !el.classList.contains('playing-active')) {
          handleKeyActivate(mappedKey);
        }
      }
    };
    const up = (e) => {
      const mappedKey = mapKey(e.key);
      if (mappedKey) handleKeyDeactivate(mappedKey);
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [handleKeyActivate, handleKeyDeactivate]);

  return (
    <div className="min-h-screen bg-[#060a12] text-emerald-50 flex flex-col items-center font-serif relative overflow-hidden select-none pb-20 touch-manipulation" onContextMenu={(e) => e.preventDefault()}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
      <WindParticles />

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'}`}>
          {toast.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle size={18}/>} <span className="text-sm font-bold tracking-wider">{toast.msg}</span>
        </div>
      )}

      <AppHeader playHotkey={playHotkey} setPlayHotkey={setPlayHotkey} isPlaying={isPlaying} onTogglePlay={playScoreAction} />

      <KeyboardPanel
        accidentals={accidentals} globalKeyOffset={globalKeyOffset}
        onKeyActivate={handleKeyActivate} onKeyDeactivate={handleKeyDeactivate}
        onToggleSharp={handleToggleSharp} progressBarRef={progressBarRef}
      />

      <ControlPanel
        bpm={bpm} setBpm={setBpm} timeSigNum={timeSigNum} setTimeSigNum={setTimeSigNum}
        timeSigDen={timeSigDen} setTimeSigDen={setTimeSigDen} charResolution={charResolution} setCharResolution={setCharResolution}
        vol={vol} setVol={setVol} tone={tone} setTone={setTone}
        reverb={reverb} onToggleReverb={handleToggleReverb} globalKeyOffset={globalKeyOffset} setGlobalKeyOffset={setGlobalKeyOffset}
      />

      <section className="z-20 w-full max-w-6xl grid lg:grid-cols-[300px_1fr] gap-8 px-4 items-start">
        <ScoreLibrary user={user} savedScores={savedScores} onLoadScore={loadScore} onClearAll={handleClearAllScores} onDeleteScore={handleDeleteScore} />
        <ScoreEditor
          score={score} setScore={setScore} scoreTitle={scoreTitle} setScoreTitle={setScoreTitle}
          onImport={handleImportLocal} onExport={handleExportLocal} onSave={handleSaveScore} onReset={handleResetScore} isSaving={isSaving}
        />
      </section>

      <footer className="z-20 mt-16 opacity-20 text-[10px] tracking-[0.6em] uppercase"> Aria Engine • Teyvat Symphony Studio </footer>

      <style>{`
        input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 2px; border-radius: 1px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: currentColor; cursor: pointer; transition: all 0.2s; border: 2px solid rgba(0,0,0,0.5); }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.1); border-radius: 10px; }
        .touch-manipulation { touch-action: manipulation; }
        input[type="number"].no-spinners::-webkit-inner-spin-button, input[type="number"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"].no-spinners { -moz-appearance: textfield; }
        @keyframes float { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 0.15; } 100% { transform: translateY(-100vh); opacity: 0; } }
        .key-wrapper { contain: layout style; }
        .will-change-transform { will-change: transform; }
        .playing-active {
          background: linear-gradient(to bottom right, #6ee7b7, #059669) !important;
          transform: scale(0.95) translateY(0) !important;
          box-shadow: 0 0 40px rgba(52,211,153,0.5) !important;
          border-color: transparent !important;
          will-change: transform, box-shadow, background;
        }
        .playing-active > span:first-child { color: white !important; }
        .playing-active > span:last-child { color: rgba(255,255,255,0.9) !important; }
        .playing-active sup { color: #d1fae5 !important; }
      `}</style>
    </div>
  );
}
