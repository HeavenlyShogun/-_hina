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
          <input value={scoreTitle} onChange={(event) => setScoreTitle(event.target.value)} className="bg-transparent outline-none flex-1 text-sm font-bold text-emerald-50" placeholder="?單?迂..." />
        </div>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <input type="file" accept=".txt" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="?? (?臬??詨??.txt 瑼?)"><FolderOpen size={18} /></button>
          <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="摮? (銝???.txt 瑼?銝血??怎?憟??唾閮剖?)"><Download size={18} /></button>
          <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2 disabled:opacity-60"><UploadCloud size={16} /> {cloudStatus === 'ready' ? (isSaving ? 'SYNC' : 'CLOUD') : (cloudStatus === 'loading' ? 'LOADING' : 'CONNECT')}</button>
          <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="?蔭?粹?閮剜?霅?"><RotateCcw size={18} /></button>
        </div>
      </div>

      <div className="bg-black/30 rounded-3xl border border-white/5 mb-6 overflow-hidden transition-all">
        <button onClick={() => setShowGuide((visible) => !visible)} className="w-full px-5 py-4 flex items-center justify-between text-emerald-400 hover:bg-white/[0.02] transition-colors outline-none">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase"><BookOpen size={14} /> 蝛箇蝭憟??????飛</div>
          <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
        </button>
        {showGuide && (
          <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-white/60 bg-black/20 animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-100/80 leading-relaxed space-y-3 border-l-2 border-emerald-500 pl-4 md:col-span-2">
              <p><b className="text-emerald-300">??蝝楊蝛箇?批嚗?</b>撌脩宏?支??渲死???賊??批嚗?憟?甈?100% 鈭斤?函??征?賡??瘙箏???</p>
              <p><b className="text-emerald-300">?∠葦???銵?</b>蝟餌絞?曉???瞈暹?銵?撠曄?銝???擗征?踝??券??銵銝????渡?憟?鈭?</p>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">???摩?圾</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">?桀?</span>
                  <div><b className="text-emerald-200">?桐??喟泵</b><br />???撖?(憒?QWE) 隞?”銝??琿??敶???</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">( )</span>
                  <div><b className="text-emerald-200">?憐 / ??敶?</b><br />?祈??扯?????莎??瑕?敺桀摹?亙憐撱園嚗?</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">蝛箇</span>
                  <div><b className="text-emerald-200">隡迫蝚?/ ??</b><br />銝?征?賭誨銵其??雿?????</div>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">?萇撠銵?</h4>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 font-mono mt-4">
                <span className="text-emerald-500">擃 (+??:</span> <span>+1 +2 +3 +4 +5 +6 +7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(Q W E R T Y U)</span></span>
                <span className="text-emerald-500">銝剝 (?∟?):</span> <span>1 2 3 4 5 6 7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(A S D F G H J)</span></span>
                <span className="text-emerald-500">雿 (-??:</span> <span>-1 -2 -3 -4 -5 -6 -7 <br /><span className="text-emerald-200/50 text-[9px] tracking-widest">(Z X C V B N M)</span></span>
              </div>
              <p className="mt-3 text-[10px] text-emerald-200/70 border-t border-white/5 pt-2">
                <b>撠?蝷綽?</b>?詨???瘥?渡蝮急毽?具?憒?<b>(-47)+1</b> 蝑???<b>(VJ)Q</b>??
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
