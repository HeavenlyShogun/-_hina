# 2026-05-12 樂譜產線與 Slim Score 進度

## 今日完成

- 補上「階段三：MIDI -> Slim Score JSON」產線。
- 新增 Node.js 壓縮工具：`scripts/slim-midi-score.mjs`。
- 新增 npm 指令：`npm run scores:slim:midi`。
- 新增播放器對 `version: "3.2-ultra-slim"` 的直接解析支援。
- 將預設琴譜由內建 legacy 文字譜改為 `surges-midi.json`。
- 移除 smoke 測試中對已不存在外部譜面檔的讀取。

## Slim Score 格式

目前 Slim Score 使用 V3.2 Ultra-Slim 結構：

```json
{
  "version": "3.2-ultra-slim",
  "columns": ["startTick", "durationTicks", "note", "velocity", "trackId"],
  "transport": {
    "bpm": 120,
    "timeSigNum": 4,
    "timeSigDen": 4,
    "resolution": 10080
  },
  "notes": [
    [0, 5040, 87, 0.7087, 0]
  ]
}
```

核心音符資料為純數字陣列：

```text
[startTick, durationTicks, note, velocity, trackId]
```

這是前端播放專用格式，不再保留肥版 V2 JSON 中大量重複欄位。

## 新增工具

```bash
npm run scores:slim:midi -- --input=music_work\combined_4.mid --output=.tmp\combined_4-slim.json --id=combined-4-slim --title=combined_4_slim
```

若要在產線最後刪除中間 MIDI：

```bash
npm run scores:slim:midi -- --input=music_work\combined_4.mid --output=src\data\scores\combined-4-slim.json --delete-input
```

注意：`--delete-input` 會真的刪除 MIDI，只應用在確認產線輸出成功後。

## 播放器支援

修改位置：

- `src/utils/score.js`

新增能力：

- 直接辨識 `version: "3.2-ultra-slim"`。
- 從 `notes` 純數字陣列還原播放事件。
- 用 MIDI note 還原頻率。
- 用最近的 Project Hina 鍵位映射視覺按鍵。
- 修正 JSON 樂譜解析時會忽略 `transport.resolution` 的問題。

## 預設琴譜

修改位置：

- `src/hooks/useScoreState.js`

目前預設琴譜改為：

```text
src/data/scores/surges-midi.json
```

初始化時以 JSON score 載入，不再使用 `DEFAULT_SCORE` legacy 文字譜。

## 移除失效讀取

修改位置：

- `scripts/smoke-cyberpunk-logic.mjs`

已移除對下列已不存在檔案的依賴：

```text
風物之琴譜/可匯入譜面/第一版/我永遠想待在你的房子裡.legacy.bak.txt
風物之琴譜/可匯入譜面/第二版/我永遠想待在你的房子裡.txt
```

現在 smoke 測試只保留內嵌片段測試，避免因外部譜面搬移或刪除造成測試失敗。

## 實測結果

使用 `music_work\combined_4.mid` 測試 Slim Score：

- Slim JSON：約 44.9 KB
- 既有肥版 V2 JSON `neo-aspect-midi.json`：約 800 KB
- Slim 解析後事件數：1623
- resolution：10080

驗證通過：

```bash
npm run smoke:cyberpunk
npm run build:vite
```

`build:vite` 在 Windows sandbox 內會遇到 Vite resolver `spawn EPERM`，已用核准的沙盒外 build 指令驗證通過。

## 目前產線建議

推薦主線仍是：

```text
OMR 圖像辨識
  -> MusicXML
  -> Python / music21 轉 MIDI
  -> Node slim-midi-score.mjs 壓縮
  -> Slim Score JSON
  -> 刪除中間 MIDI
  -> Project Hina 前端播放
```

理由：

- Python 保持處理 MusicXML / music21 的工作。
- Node 壓縮器留在前端專案內，方便與播放器 schema 同步演進。
- 前端最終只吃 Slim Score JSON，避免部署大檔案。

## 待辦

- 把現有 `surges-midi.json`、`neo-aspect-midi.json`、`combined-11-midi.json` 逐步轉為 Slim Score。
- 更新 `src/data/importableScoreFiles.js` 的 glob，讓 `*-slim.json` 也能被列入可匯入清單。
- 決定肥版 V2 JSON 是否保留為開發參考，或移到 `music_work` / 備份資料夾。
- 若正式採用 Slim Score，將 `scripts/import-midi-score.mjs` 標記為 legacy importer。
- 在 README 補上「OMR -> MusicXML -> MIDI -> Slim Score」使用流程。

## 相關檔案

- `scripts/slim-midi-score.mjs`
- `src/utils/score.js`
- `src/hooks/useScoreState.js`
- `scripts/smoke-cyberpunk-logic.mjs`
- `package.json`
