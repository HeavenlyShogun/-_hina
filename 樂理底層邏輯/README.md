# 樂理底層邏輯

本文件是 parser、播放器、譜面顯示與匯入流程的共同合約。任何新譜面格式最後都必須轉成 canonical event，再交給播放與顯示層使用。

## Step 0：編碼規範

- `src/` 與 `風物之琴譜/` 下的 `.txt`、`.js`、`.jsx` 一律使用 UTF-8 無 BOM。
- 檢查指令：

```bash
node scripts/ensure-utf8.mjs
```

- 實際修正指令：

```bash
node scripts/ensure-utf8.mjs --write
```

腳本只做編碼層處理：移除 UTF-8 BOM，並在檔案不是合法 UTF-8 bytes 時嘗試從 Big5、GB18030、Shift_JIS、UTF-16LE 轉為 UTF-8。已經是合法 UTF-8 的檔案不會被重新轉碼。

## 時間模型

- `PPQ = 96`：一個四分音符等於 96 ticks。
- `bpm`：每分鐘四分音符數。
- `timeSigNum / timeSigDen`：拍號，例如 4/4。
- `charResolution`：文字譜面的節拍分割，例如 16 代表以 16 分音符格線解析。
- `tick`：音符開始時間，單位為 ticks。
- `durationTicks`：音符長度，單位為 ticks。

常用換算：

```text
secondsPerTick = (60 / bpm) / PPQ
event.time = event.tick * secondsPerTick
event.durationSec = event.durationTicks * secondsPerTick
measureTicks = PPQ * timeSigNum * (4 / timeSigDen)
```

## 音高模型

簡譜以 `1 2 3 4 5 6 7` 表示音階級數，`0` 表示休止符。

- `globalKeyOffset`：主音相對 C 的半音偏移，例如 C=0、F#=6。
- `scaleMode`：`major` 或 `minor`。
- `#` / `b`：臨時升降記號。
- `'` / `,` 或 `+` / `-`：八度位移。

簡譜轉 MIDI 的概念：

```text
midi = baseOctaveMidi + globalKeyOffset + scaleInterval[degree - 1] + accidental + octaveShift * 12
frequency = 440 * 2 ** ((midi - 69) / 12)
```

## 舊版鍵位譜語法

舊版鍵位譜以鍵盤字母直接表示音高，主要給 `textNotation: "legacy-beat"` 或 `legacyTimingMode: "beat"` 使用。parser 會先切出 `/` 之間的拍段，再把拍段內的音符、和弦與休止符平均分配在該拍內。

| 語法標記 | 對應音樂概念 | 實際操作邏輯 |
|---|---|---|
| `/` | 拍點線 | 每遇到一個斜線，就代表進入下一個拍點。空拍段也會推進一拍。 |
| `(ABC)` | 和弦 / 同步 | `A`、`B`、`C` 三個鍵在同一個 tick 一起按下。括號內空白只當排版，不產生休止符。 |
| 空格 | 休止符 | 拍段內空格保持沉默、不按鍵，用來對齊節奏。拍段開頭與結尾空白只當排版。 |
| `AB` | 快速連彈 | `A` 彈完立刻彈 `B`，兩個音平均分配在同一拍內，對應簡譜下劃線的快速音。 |
| `A-M`, `Q-U`, `Z-M` | 音高 | `A-J` 是中音排，`Q-U` 是高音排，`Z-M` 是低音排；大小寫都會正規化成同一鍵位。 |

## Canonical Event Contract

播放器只應依賴 canonical event。舊欄位如 `startTick`、`key`、`velocity`、`duration` 可以在 parser 內相容，但輸出到播放層前必須正規化。

```json
{
  "id": "event-1",
  "tick": 0,
  "durationTicks": 96,
  "time": 0,
  "durationSec": 0.5,
  "k": "Q",
  "v": 0.85,
  "isRest": false,
  "frequency": 261.6256,
  "noteName": "C4",
  "trackId": "main",
  "importance": 100
}
```

欄位規範：

| 欄位 | 型別 | 必填 | 說明 |
|---|---:|---:|---|
| `id` | string | 否 | 穩定事件 ID；沒有時可由 parser 產生 |
| `tick` | number | 是 | 開始 tick，整數且不可小於 0 |
| `durationTicks` | number | 是 | 長度 tick，整數且至少 1 |
| `time` | number | 是 | 開始秒數，由 tick 與 tempo 計算 |
| `durationSec` | number | 是 | 長度秒數 |
| `k` | string/null | 是 | 對應鍵盤鍵位；休止符或無鍵位音可為 null |
| `v` | number | 是 | velocity，範圍 0 到 1 |
| `isRest` | boolean | 是 | 是否為休止符 |
| `frequency` | number/null | 是 | 音高頻率；休止符為 null |
| `noteName` | string/null | 是 | 例如 `C4`、`F#5` |
| `trackId` | string | 是 | 聲部或軌道 ID，預設 `main` |
| `importance` | number | 否 | 給練習評分或顯示排序使用 |

## JSON V2 Score Contract

匯入、匯出與歌單儲存建議使用此結構。`tracks[].events` 可以保留較精簡的事件，載入時再正規化成 canonical event。

```json
{
  "version": "2.0",
  "meta": {
    "id": "twinkle-twinkle-basic",
    "title": "小星星",
    "difficulty": "beginner",
    "playlistId": "beginner-single-note",
    "tags": ["兒歌", "單音"],
    "schemaVersion": 1
  },
  "transport": {
    "bpm": 90,
    "timeSigNum": 4,
    "timeSigDen": 4,
    "resolution": 96
  },
  "playback": {
    "tone": "piano",
    "globalKeyOffset": 0,
    "scaleMode": "major",
    "reverb": true
  },
  "source": {
    "format": "numbered-text@1",
    "rawText": "1 1 5 5 6 6 5-"
  },
  "tracks": [
    {
      "id": "main",
      "name": "Main",
      "mute": false,
      "events": [
        {
          "type": "note",
          "tick": 0,
          "durationTicks": 96,
          "degree": 1,
          "velocity": 0.85
        }
      ]
    }
  ]
}
```

## 功能落點

- 速度選擇：使用 `playbackController.setPlaybackRate(rate)`，UI 建議提供 `0.5x / 0.75x / 1x / 1.25x / 1.5x` 與重置 `1x`。
- 分割節拍：以 `charResolution` 和 `measureTicks` 為基礎，在 `SheetDisplay` 顯示小節線與拍線。
- 入門歌單：兒歌與單音譜同時作為使用者內容與 parser 測試案例。
- 逐幀 debug：以 `currentTick`、`activeNotes`、下一批 scheduled events 做三層對照，建議藏在 Developer Mode。
- 匯入歌單：譜面 metadata 預留 `playlistId`、`difficulty`、`tags`、`schemaVersion`，方便日後遷移。
