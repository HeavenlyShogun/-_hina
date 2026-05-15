# Universal Rhythm Recorder (Project Hina) - Instructions

## Core Architecture
- **Framework:** React + Vite.
- **State Management:** local hooks + context providers, mainly `useScoreState`, `AudioConfigContext`, and `PlaybackContext`.
- **Styling:** Tailwind CSS + Lucide React icons.
- **Audio Engine:** custom playback logic using Tone.js and `@tonejs/midi`.
- **Data Model:**
    - **Current editor format:** JSON `version: "2.0"` with `meta`, `transport`, `playback`, `source`, and `tracks[].events[]`.
    - **Supported source formats:** text score, JSON score, MIDI, MusicXML, and Slim Score `version: "3.2-ultra-slim"`.
- **Backend:** Firebase (Firestore for scores, Hosting for web).

## Key Workflows
### Development
- `npm run dev` to start the local server.
- Use UTF-8 for all files, especially those with Chinese characters.

### Score Management
- Frontend playback always goes through `normalizeScoreSource()`.
- Slim Score is still an important import/source format, but the editor's main working format is JSON `version: "2.0"`.
- The converter supports batch MIDI / MusicXML import, replace-to-editor, and append-to-tail merge.
- Source scores are stored in `風物之琴譜/`.

### Deployment
- **GitHub Pages:**
    - Build: `npm run build:pages`
    - Base path: `/-_hina/`
    - Automated via GitHub Actions on push to `main`.
- **Firebase Hosting:**
    - Build & Deploy: `firebase deploy` (automatically runs `npm run build:firebase`).
    - Base path: `/`.
- **Note:** `dist/` content depends on the last build target. Do not mix builds between platforms.

## Coding Standards
- Prefer functional components and hooks.
- Use explicit and idiomatic language features.
- Avoid redundant logic; prioritize simplicity and performance (especially for score parsing).
- Ensure `SheetDisplay.jsx` can handle missing visual data gracefully.

## Reference Documentation
- Memory index: `專案記憶/00_專案記憶索引.md`
- Current system overview: `專案記憶/01_目前系統總覽.md`
- Page fields and memory update rules: `專案記憶/02_頁面欄位與記憶更新邏輯.md`
- Score system and converter notes: `專案記憶/03_譜面系統與轉換記憶.md`
- Firebase and cloud notes: `專案記憶/04_Firebase與雲端曲庫記憶.md`
- GitHub and deployment notes: `專案記憶/05_GitHub與部署記憶.md`
