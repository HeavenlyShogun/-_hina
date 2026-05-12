# Universal Rhythm Recorder (Project Hina) - Instructions

## Core Architecture
- **Framework:** React 19 + Vite.
- **State Management:** Zustand.
- **Styling:** Tailwind CSS + Lucide React icons.
- **Audio Engine:** Custom logic using Tone.js/midi for parsing.
- **Data Model:** 
    - **V3 Event Model (Current):** Uses a stream of events (`tick`, `durationTicks`, `k`, `v`, `noteName`, `frequency`, `trackId`).
    - **Legacy V2 Model:** Older structure, compatibility layer exists in `src/utils/scoreV3toV2.js` and `src/utils/midiToV2.js`.
- **Backend:** Firebase (Firestore for scores, Hosting for web).

## Key Workflows
### Development
- `npm run dev` to start the local server.
- Use UTF-8 for all files, especially those with Chinese characters.

### Score Management
- Focus is on **SlimScore** (lightweight score output).
- High-priority task: Reducing score JSON size to improve performance.
- Scripts in `scripts/` handle score migration and normalization.
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
- Architecture notes: `專案記憶/V2至V3樂譜模型遷移筆記.md`
- Deployment details: `專案記憶/Git操作流程.md`
- Status summary: `專案現況總結.md`
