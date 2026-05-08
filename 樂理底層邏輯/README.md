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

舊版鍵位譜以鍵盤字母直接表示音高，主要給 `textNotation: "legacy-beat"` 或 `legacyTimingMode: "beat"` 使用。parser 採用 slash cell 節奏引擎：每個 `/` 結束一個 `charResolution` 時間槽，預設就是 16 分音符；槽內的音符、和弦與空白都會被保留並一起細分該槽。

| 語法標記 | 對應音樂概念 | 實際操作邏輯 |
|---|---|---|
| `/` | 16 分音符槽邊界 | 每個 `/` 都推進一個 `charResolution` 時間單位。`(VA) / M / (MG) /(AG) Q /` 會形成 4 個時間槽。 |
| `(ABC)` | 和弦 / 撥奏 | 括號整體是槽內的一個事件；括號內空白只當和弦排版。多鍵會以約 12ms 間距依序觸發，保留原版撥奏感。 |
| 空格 | 槽內休止時間 | 空白本身就是時間，包含前後空白；它會和音符一起細分所在 `/` 時間槽，不能 trim 掉。 |
| `AB` | 槽內快速連彈 | `A` 與 `B` 是同一槽內的連續事件，依槽內事件數平均分配 onset。 |
| `0` | 明確休止符 | 是槽內的一個休止事件，會輸出 rest event，方便顯示與練習判定。 |
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

## 新版譜面時值規範

新版文字譜以「一拍 = `1.0`」作為 parser 內部時值單位。所有 token 必須先轉成 `durationBeats`，再換算成 `durationTicks`。

```text
durationTicks = durationBeats * PPQ
```

在 4/4 拍中，每一小節的總和必須等於 `4.0`。parser 遇到小節線 `|` 時會立刻檢查該 track 目前累積拍數；如果不等於拍號要求，必須丟出錯誤，不可默默補齊或略過。

強制標記化輸出範例：

```text
(C4, 1.0) (D4, 0.5) (E4, 0.5) R0.5 (F4, 0.25) (G4, 0.25) (A4, 1.0)
```

其中 `R0.5` 代表 0.5 拍休止符。左右手或多聲部應以不同 `trackId` 保存，各 track 分別檢查小節拍數，播放前再合併成 canonical event stream。

## 功能落點

- 速度選擇：使用 `playbackController.setPlaybackRate(rate)`，UI 建議提供 `0.5x / 0.75x / 1x / 1.25x / 1.5x` 與重置 `1x`。
- 分割節拍：以 `charResolution` 和 `measureTicks` 為基礎，在 `SheetDisplay` 顯示小節線與拍線。
- 入門歌單：兒歌與單音譜同時作為使用者內容與 parser 測試案例。
- 逐幀 debug：以 `currentTick`、`activeNotes`、下一批 scheduled events 做三層對照，建議藏在 Developer Mode。
- 匯入歌單：譜面 metadata 預留 `playlistId`、`difficulty`、`tags`、`schemaVersion`，方便日後遷移。
