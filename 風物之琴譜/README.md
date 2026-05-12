# 風物之琴譜

這個資料夾現在同時承擔三件事：

- `縮小版可匯入譜面/slim-json/`: 前端實際會讀取的 slim JSON 譜面。
- `不可匯入太大譜面/`: 原本體積過大的 V2 JSON 備份，不直接給前端載入。
- `轉檔產線/`: 把舊譜面或 MusicXML 壓成 `3.2-ultra-slim` 的生產線腳本。

## 立即救援

如果 MIDI 遺失，但 `src/data/scores/*.json` 還在，可以直接跑：

```bash
node 風物之琴譜/轉檔產線/rescue-fat-json.mjs
```

它會把：

- `surges-midi.json`
- `neo-aspect-midi.json`
- `combined-11-midi.json`

轉成 slim JSON，並輸出到：

```text
風物之琴譜/縮小版可匯入譜面/slim-json/
```

其中 `combined-11-midi.json` 會被改名成 `dinner-song-slim.json`，標題改成 `晚餐歌`。

## 未來產線

如果未來要從 MusicXML 直接輸出 slim JSON，可用：

```bash
python 風物之琴譜/轉檔產線/export_musicxml_to_slim.py <input.musicxml> <output.json> --title="曲名"
```

這條路徑會略過 MIDI 中繼檔，直接得到前端可吃的 ultra-slim JSON。
