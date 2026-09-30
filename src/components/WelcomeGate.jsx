import { useState } from 'react';
import { ArrowDown, ArrowRight, AudioLines, BookOpen, ChevronDown, Disc3, Music2, Sparkles } from 'lucide-react';
import galaxyBackgroundUrl from '../assets/galaxy-background.jpg';

const guideItems = [
  {
    icon: BookOpen,
    step: '01',
    title: '匯入、整理與轉換樂譜',
    summary: '把手邊的樂譜帶進來，建立自己的播放清單。',
    detail: '你可以載入 JSON 或 Slim JSON 樂譜，也可以在轉換區匯入 MIDI、MusicXML 與 MXL。轉換完成後，檢視曲目與音符內容，再加入曲庫或播放清單，逐步整理自己的音樂素材。',
  },
  {
    icon: Music2,
    step: '02',
    title: '選擇演奏方式，調整音色',
    summary: '從單人彈奏到樂團編制，依照想聽的方式播放。',
    detail: '單人模式適合以鍵盤彈奏旋律；樂團模式會依音域與樂器資訊分配旋律、和弦、低音及打擊聲部；管弦模式則保留多軌樂譜的編制。你也能為聲部或軌道挑選音色並調整音量。',
  },
  {
    icon: Disc3,
    step: '03',
    title: '播放、練習並保存成果',
    summary: '控制速度與節拍，跟著播放練習，也能保存作品。',
    detail: '使用播放控制調整速度、拍號與音量，配合節拍器練習；需要時可逐段檢視樂譜、管理佇列，並將完成的內容保存到個人曲庫。登入雲端後，可同步與管理自己的樂譜。',
  },
];

export default function WelcomeGate({ onEnter, isLoading }) {
  const [openGuide, setOpenGuide] = useState(null);

  return (
    <main className="welcome-page" style={{ '--welcome-image': `url("${galaxyBackgroundUrl}")` }}>
      <div className="welcome-grain" aria-hidden="true" />
      <header className="welcome-topbar">
        <a className="welcome-brand" href="#top" aria-label="Universe Rhythm Recorder 首頁">
          <span className="welcome-brand-mark"><AudioLines size={19} /></span>
          <span>UNIVERSE <b>RHYTHM RECORDER</b></span>
        </a>
        <span className="welcome-top-note"><span /> YOUR MUSIC, IN ORBIT</span>
      </header>

      <section className="welcome-hero" id="top">
        <div className="welcome-copy">
          <div className="welcome-eyebrow"><Sparkles size={13} /> A SPACE FOR EVERY NOTE</div>
          <h1>讓每一段旋律<br /><em>都找到自己的軌道</em></h1>
          <p>把樂譜化成聽得見、看得見，也能親自演奏的音樂體驗。<br />從匯入曲目、調整編制到日常練習，打造你的專屬音樂空間。</p>
          <button className="welcome-cta" onClick={onEnter} disabled={isLoading}>
            {isLoading ? '正在準備你的音樂空間…' : '進入音樂宇宙'}
            {!isLoading && <ArrowRight size={17} />}
          </button>
          <div className="welcome-footnote"><span className="welcome-live-dot" />進入後即可使用工作區；雲端曲庫會在背景連線並同步。</div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-orbit orbit-one" /><div className="welcome-orbit orbit-two" />
          <div className="welcome-planet"><div className="planet-highlight" /><div className="planet-ring" /></div>
          <div className="welcome-note note-a">♫</div><div className="welcome-note note-b">♪</div>
          <div className="welcome-soundwave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="welcome-art-label"><span>NOW PLAYING</span><b>your next favorite song</b></div>
        </div>
      </section>

      <section className="welcome-guide" aria-labelledby="guide-title">
        <div className="welcome-guide-heading">
          <div><span className="welcome-section-kicker">A LITTLE ORIENTATION</span><h2 id="guide-title">從樂譜到演奏，開始你的音樂旅程</h2></div>
          <span className="welcome-hint"><ArrowDown size={14} />展開步驟，認識工作區功能</span>
        </div>
        <div className="welcome-guide-list">
          {guideItems.map(({ icon: Icon, step, title, summary, detail }, index) => {
            const isOpen = openGuide === index;
            return (
              <article className={`welcome-guide-item${isOpen ? ' is-open' : ''}`} key={step}>
                <button className="welcome-guide-trigger" aria-expanded={isOpen} onClick={() => setOpenGuide(isOpen ? null : index)}>
                  <span className="welcome-step-icon"><Icon size={18} /></span>
                  <span className="welcome-step-number">{step}</span>
                  <span className="welcome-step-copy"><b>{title}</b><small>{summary}</small></span>
                  <ChevronDown className="welcome-chevron" size={18} />
                </button>
                {isOpen && <p className="welcome-guide-detail">{detail}</p>}
              </article>
            );
          })}
        </div>
      </section>
      <footer className="welcome-footer"><span>UNIVERSE RHYTHM RECORDER</span><span>PLAY · PRACTICE · CREATE</span></footer>
    </main>
  );
}
