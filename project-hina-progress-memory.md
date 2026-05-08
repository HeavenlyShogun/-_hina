# Project Hina Progress Memory

## 2026-05-08

- 新增 `專案記憶/` 作為集中記憶資料夾。
- 新增 `專案記憶/鋼琴彈奏邏輯版本記憶.md`：把舊版鍵位譜 slash cell 邏輯定義為 1 版，把新版 canonical event / 簡譜時值邏輯定義為 2 版，3 版先保留為未來版本座標。
- 新增 `專案記憶/檔案專案執行記憶模式.md`：集中保存檔案處理、專案執行、驗證與後續記憶追加規則。

## 2026-05-07

- 修正 `jianpu` 播放調性鏈路：`useScorePlayback.js` 現在在 `loadCurrentScore` / `loadProvidedScore` 解析譜面時，會把 `globalKeyOffset` 與 `scaleMode` 一併傳入 `normalizeScoreSource(...)`。
- 這讓數字譜不再固定落回預設 `C major`；目前會依來源或目前音訊設定，正確以目標調性換算頻率後播放。
- 統一 `I Really Want to Stay at Your House` 的內建基準設定為 `F# major / 125 BPM / 4/4 / 16th grid / piano / reverb on`。
- 已更新 `src/utils/scoreRecommendations.js` 與 `src/data/featuredScores.js`，避免這首歌在推薦值與 featured 值之間出現 `125` / `128 BPM` 不一致。
- 殘留事項：`風物之琴譜/可匯入譜面/我永遠想待在你的房子裡*.txt` 的 `META` 首行因檔案編碼混雜，本次未直接改寫；但實際播放邏輯已能依 `F# major / 125 BPM / 4/4 / 16th` 運作。

## 2026-05-02

- 達成：全系統 Canonical Schema 大一統，捨棄 Spacing-based 邏輯。
- `score.js` canonical event schema 確立為 `tick`, `durationTicks`, `k`, `v`, `noteName`, `frequency`, `trackId`。
- `scoreDocument.js` 的 `compiledEvents` 直接持有 canonical events，不再降格成舊播放格式。
- `playbackController.js` 改為只接受 canonical schema，移除 `startTick/key/duration/velocity` 類型的 fallback。
- 周邊 consumer 與轉檔腳本已同步收斂到 canonical schema。
- `normalize-score-files.mjs` 預設輸出更新為 `numbered-text@1`，並標記 `textNotation: "jianpu"`、`ppq: 96`。
