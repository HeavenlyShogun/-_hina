# Project Hina Progress Memory

## 2026-05-02

- 達成：全系統 Canonical Schema 大一統，捨棄 Spacing-based 邏輯。
- `score.js` canonical event schema 確立為 `tick`, `durationTicks`, `k`, `v`, `noteName`, `frequency`, `trackId`。
- `scoreDocument.js` 的 `compiledEvents` 直接持有 canonical events，不再降格成舊播放格式。
- `playbackController.js` 改為只接受 canonical schema，移除 `startTick/key/duration/velocity` 類型的 fallback。
- 周邊 consumer 與轉檔腳本已同步收斂到 canonical schema。
- `normalize-score-files.mjs` 預設輸出更新為 `numbered-text@1`，並標記 `textNotation: "jianpu"`、`ppq: 96`。
