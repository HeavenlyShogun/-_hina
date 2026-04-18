import React, { memo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, Edit3, FolderOpen, RotateCcw, UploadCloud } from 'lucide-react';

const SheetDisplay = memo(({ score, setScore, scoreTitle, setScoreTitle, onImport, onExport, onSave, onReset, isSaving, onConnectCloud, cloudStatus }) => {
  const fileInputRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col shadow-2xl relative">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="w-full sm:flex-1 min-w-[200px] flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 focus-within:border-emerald-500/40">
          <Edit3 size={18} className="text-emerald-400" />
          <input value={scoreTitle} onChange={(event) => setScoreTitle(event.target.value)} className="bg-transparent outline-none flex-1 text-sm font-bold text-emerald-50" placeholder="輸入曲譜名稱..." />
        </div>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <input type="file" accept=".txt" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯入本機文字譜（.txt）"><FolderOpen size={18} /></button>
          <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯出成文字譜（.txt，含目前參數）"><Download size={18} /></button>
          <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2 disabled:opacity-60"><UploadCloud size={16} /> {cloudStatus === 'ready' ? (isSaving ? 'SYNC' : 'CLOUD') : (cloudStatus === 'loading' ? 'LOADING' : 'CONNECT')}</button>
          <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="重設為預設譜面"><RotateCcw size={18} /></button>
        </div>
      </div>

      <div className="bg-black/30 rounded-3xl border border-white/5 mb-6 overflow-hidden transition-all">
        <button onClick={() => setShowGuide((visible) => !visible)} className="w-full px-5 py-4 flex items-center justify-between text-emerald-400 hover:bg-white/[0.02] transition-colors outline-none">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase"><BookOpen size={14} /> 簡譜輸入說明</div>
          <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
        </button>
        {showGuide && (
          <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-white/60 bg-black/20 animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-100/80 leading-relaxed space-y-3 border-l-2 border-emerald-500 pl-4 md:col-span-2">
              <p><b className="text-emerald-300">這個輸入框支援什麼格式？</b>你可以直接輸入鍵盤對應字母，也可以混用簡譜寫法。系統會依照目前 BPM、拍號與字元解析度進行播放。</p>
              <p><b className="text-emerald-300">什麼時候該用括號與空白？</b>括號代表同時發聲的和弦，空白代表一個最小時間單位的停頓；加上 `|` 可以讓譜面更容易按小節閱讀。</p>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">基本規則</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">A~Z</span>
                  <div><b className="text-emerald-200">單音播放</b><br />例如 `Q`、`A`、`V`，每個字代表一個音。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">( )</span>
                  <div><b className="text-emerald-200">和弦 / 同時按下</b><br />例如 `(QWE)` 或 `(17)`，括號內的音會在同一拍附近一起觸發。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">空白</span>
                  <div><b className="text-emerald-200">停頓 / 延拍</b><br />加入空格可讓旋律往後推一格，做出節奏間隔。</div>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">簡譜對照</h4>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 font-mono mt-4">
                <span className="text-emerald-500">高音：</span> <span>+1 +2 +3 +4 +5 +6 +7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(Q W E R T Y U)</span></span>
                <span className="text-emerald-500">中音：</span> <span>1 2 3 4 5 6 7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(A S D F G H J)</span></span>
                <span className="text-emerald-500">低音：</span> <span>-1 -2 -3 -4 -5 -6 -7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(Z X C V B N M)</span></span>
              </div>
              <p className="mt-3 text-[10px] text-emerald-200/70 border-t border-white/5 pt-2">
                <b>混寫範例：</b>`(-47)+1`、`(VJ)Q` 都是合法寫法。
              </p>
            </div>
          </div>
        )}
      </div>
      <textarea value={score} onChange={(event) => setScore(event.target.value)} spellCheck={false} className="flex-1 min-h-[300px] md:min-h-[350px] bg-black/50 border border-white/5 rounded-3xl p-5 md:p-6 text-xs font-mono leading-relaxed outline-none text-emerald-100/60 custom-scrollbar shadow-inner focus:border-emerald-500/20" />
    </div>
  );
});

export default SheetDisplay;
