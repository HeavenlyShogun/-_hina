import { useState } from 'react';
import { ArrowDown, ArrowRight, AudioLines, BookOpen, ChevronDown, Disc3, Music2, Sparkles } from 'lucide-react';
import galaxyBackgroundUrl from '../assets/galaxy-background.jpg';

const guideItems = [
  {
    icon: BookOpen,
    step: '01',
    title: '從曲庫找到一首歌',
    summary: '挑選內建樂譜，或匯入自己的音樂檔。',
    detail: '曲庫收錄多首可播放的樂譜。你也可以匯入 JSON 樂譜，或使用轉檔工具整理 MusicXML、MIDI 等來源。',
  },
  {
    icon: Music2,
    step: '02',
    title: '跟著鍵盤練習與播放',
    summary: '調整速度、音色和調性，找到舒服的練習方式。',
    detail: '畫面會隨著樂曲顯示演奏進度。你可以慢速播放、切換音色，也能用鍵盤即時彈奏。',
  },
  {
    icon: Disc3,
    step: '03',
    title: '編輯、收藏並分享樂譜',
    summary: '把喜歡的曲子存進歌單，繼續自己的創作。',
    detail: '登入後可將樂譜存到雲端、編輯內容、整理歌單，並產生連結與其他人分享。',
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
          <h1>讓每一段旋律<br /><em>都有自己的軌道。</em></h1>
          <p>在星際之間播放、練習、編輯你的樂譜。<br />從一首歌開始，慢慢建立自己的音樂宇宙。</p>
          <button className="welcome-cta" onClick={onEnter} disabled={isLoading}>
            {isLoading ? '正在準備你的音樂空間…' : '進入音樂宇宙'}
            {!isLoading && <ArrowRight size={17} />}
          </button>
          <div className="welcome-footnote"><span className="welcome-live-dot" /> 無需註冊即可開始，雲端收藏會以匿名帳號保存</div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-orbit orbit-one" /><div className="welcome-orbit orbit-two" />
          <div className="welcome-planet"><div className="planet-highlight" /><div className="planet-ring" /></div>
          <div className="welcome-note note-a">♪</div><div className="welcome-note note-b">♫</div>
          <div className="welcome-soundwave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="welcome-art-label"><span>NOW PLAYING</span><b>your next favorite song</b></div>
        </div>
      </section>

      <section className="welcome-guide" aria-labelledby="guide-title">
        <div className="welcome-guide-heading">
          <div><span className="welcome-section-kicker">A LITTLE ORIENTATION</span><h2 id="guide-title">你的音樂旅程，從這裡開始</h2></div>
          <span className="welcome-hint"><ArrowDown size={14} /> 點選步驟，看看可以做什麼</span>
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
