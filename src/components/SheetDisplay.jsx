import React, { memo, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Download, Edit3, FolderOpen, RotateCcw, UploadCloud } from 'lucide-react';

const SheetDisplay = memo(({
  score,
  setScore,
  scoreTitle,
  setScoreTitle,
  onImport,
  onLoadJsonDemo,
  onExport,
  onSave,
  onReset,
  isSaving,
  onConnectCloud,
  cloudStatus,
}) => {
  const fileInputRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);
  const isJsonScore = typeof score === 'object' && score !== null;
  const scoreEditorValue = useMemo(
    () => (typeof score === 'string' ? score : JSON.stringify(score, null, 2)),
    [score],
  );

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col shadow-2xl relative">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="w-full sm:flex-1 min-w-[200px] flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 focus-within:border-emerald-500/40">
          <Edit3 size={18} className="text-emerald-400" />
          <input
            value={scoreTitle}
            onChange={(event) => setScoreTitle(event.target.value)}
            className="bg-transparent outline-none flex-1 text-sm font-bold text-emerald-50"
            placeholder="輸入琴譜名稱..."
          />
        </div>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <input type="file" accept=".txt,.json" multiple className="hidden" ref={fileInputRef} onChange={onImport} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯入本地琴譜">
            <FolderOpen size={18} />
          </button>
          {onLoadJsonDemo ? (
            <button onClick={onLoadJsonDemo} className="flex items-center justify-center px-4 py-3 bg-sky-500/10 hover:bg-sky-500/20 rounded-2xl border border-sky-400/20 text-sky-300 transition-all text-[11px] font-black tracking-widest" title="載入 JSON demo">
              JSON DEMO
            </button>
          ) : null}
          <button onClick={onExport} className="flex items-center justify-center p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-emerald-400 transition-all" title="匯出目前琴譜">
            <Download size={18} />
          </button>
          <button onClick={cloudStatus === 'ready' ? onSave : onConnectCloud} disabled={isSaving || cloudStatus === 'loading'} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-lg ml-1 sm:ml-2 disabled:opacity-60">
            <UploadCloud size={16} />
            {cloudStatus === 'ready' ? (isSaving ? 'SYNC' : 'CLOUD') : (cloudStatus === 'loading' ? 'LOADING' : 'CONNECT')}
          </button>
          <button onClick={onReset} className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/20 text-rose-400 transition-all" title="重設目前琴譜">
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      <div className="bg-black/30 rounded-3xl border border-white/5 mb-6 overflow-hidden transition-all">
        <button onClick={() => setShowGuide((visible) => !visible)} className="w-full px-5 py-4 flex items-center justify-between text-emerald-400 hover:bg-white/[0.02] transition-colors outline-none">
          <div className="flex items-center gap-2 font-black text-[10px] tracking-widest uppercase">
            <BookOpen size={14} />
            譜面說明
          </div>
          <ChevronRight size={16} className={`transition-transform duration-300 ${showGuide ? 'rotate-90' : ''}`} />
        </button>
        {showGuide && (
          <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-white/60 bg-black/20 animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-100/80 leading-relaxed space-y-3 border-l-2 border-emerald-500 pl-4 md:col-span-2">
              <p>
                <b className="text-emerald-300">Legacy 文字譜</b>
                直接輸入鍵位字元即可播放，空白會推進節奏，括號表示和弦。
              </p>
              <p>
                <b className="text-emerald-300">JSON Score</b>
                可透過上方的 `JSON DEMO` 或匯入 `.json` 檔進行測試；載入後播放器會自動同步 BPM、音色、殘響與移調設定。
              </p>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">快速對照</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">A~Z</span>
                  <div><b className="text-emerald-200">鍵位映射</b><br />鍵盤 `Q~U / A~J / Z~M` 對應三排音域。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">( )</span>
                  <div><b className="text-emerald-200">和弦</b><br />例如 `(QWE)` 或 `(135)` 會在同一拍內依序觸發。</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono bg-black/40 px-1.5 py-0.5 rounded shrink-0">JSON</span>
                  <div><b className="text-emerald-200">結構譜面</b><br />使用 `transport / playback / tracks / events` schema 描述曲目。</div>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-emerald-300 font-bold mb-3 border-b border-white/10 pb-1">目前狀態</h4>
              <p className="leading-relaxed">
                {isJsonScore
                  ? '目前載入的是 JSON score。編輯區會以唯讀方式顯示結構內容，播放參數已由 metadata 同步到控制面板。'
                  : '目前載入的是文字譜。你可以直接在下方編輯並沿用既有播放流程。'}
              </p>
            </div>
          </div>
        )}
      </div>

      <textarea
        value={scoreEditorValue}
        onChange={(event) => setScore(event.target.value)}
        readOnly={isJsonScore}
        spellCheck={false}
        className="flex-1 min-h-[300px] md:min-h-[350px] bg-black/50 border border-white/5 rounded-3xl p-5 md:p-6 text-xs font-mono leading-relaxed outline-none text-emerald-100/60 custom-scrollbar shadow-inner focus:border-emerald-500/20"
      />
    </div>
  );
});

export default SheetDisplay;
