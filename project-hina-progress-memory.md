# Project Hina Progress Memory

## 2026-05-08

- 已完成文字譜匯入架構的 declarative 化：`scoreTextMeta.js` 已作為 `// [META]` 的統一匯入 / 匯出入口。
- `normalizeScoreSource()` 現在對缺少 `META` 的文字譜採 strict 模式，不再默默猜測格式。
- 第一版 legacy 譜面保留 `legacy-text@1` / `textNotation: "legacy"` 路線，避免舊譜在新流程中失效。
- 已修正 `useScorePlayback.js` / 匯入鏈路，確保譜面自身宣告的 `bpm`、`globalKeyOffset`、`scaleMode` 等參數優先於 UI 殘留狀態。
- 已重寫 `src/utils/scoreRecommendations.js` 的 matcher，改為穩定的中英文曲名匹配，不再依賴受編碼污染的字串。
- 已修正 `src/data/featuredScores.js`，使 featured 譜面指向目前存在的 `風物之琴譜/可匯入譜面/第一版/` 檔案。
- 已為以下第一版譜面補上檔首 `// [META]`：
  `CALL OF SILENCE`、`CRY FOR ME`、`千本櫻`、`我永遠想待在你房子裡`、`打上花火`、`春日影`、`未聞花名`、`溯`、`起風了`。
- 已用 Node 驗證上述 9 首第一版譜面皆可成功通過 `normalizeScoreSource()`。
- 已執行 `npm.cmd install`，`node_modules/` 恢復完成。
- 已執行 `npm.cmd run build`，production build 通過；目前 React / Vite UI、`scoreRecommendations.js`、`featuredScores.js`、第一版譜面 `META` 已整合成功。
- 尚未完成：
  `Rescue Dialog` 仍待實作，用於處理使用者匯入缺少 `META` 的舊譜時的格式選擇與補救流程。
- 下次啟用的首要任務：
  修改與開發第二版邏輯，優先處理第二版譜面的匯入、播放、參數宣告一致性，再評估是否接續導入 `Rescue Dialog`。

## 2026-05-07

- 修正 `jianpu` 播放調性鏈路：`useScorePlayback.js` 在 `loadCurrentScore` / `loadProvidedScore` 解析譜面時，會把 `globalKeyOffset` 與 `scaleMode` 一併傳入 `normalizeScoreSource(...)`。
- 統一 `I Really Want to Stay at Your House` 的內建基準設定為 `F# major / 125 BPM / 4/4 / 16th grid / piano / reverb on`。
- 更新 `src/utils/scoreRecommendations.js` 與 `src/data/featuredScores.js`，避免推薦值與 featured 值之間出現 BPM 不一致。

## 2026-05-02

- 底層 canonical schema 已成形，`score.js` 的 canonical event 以 `tick`、`durationTicks`、`k`、`v`、`noteName`、`frequency`、`trackId` 為主。
- `scoreDocument.js` 與 `playbackController.js` 已改為依賴 canonical event，不再依賴舊式 fallback 欄位。
- `normalize-score-files.mjs` 已能將現代文字譜正規化為 `numbered-text@1`，並附帶 `textNotation: "jianpu"` 與 `ppq: 96`。
