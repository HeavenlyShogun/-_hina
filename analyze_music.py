import music21
import os

# 1. 讀取檔案 (請確保檔名正確)
xml_file = '1778300334111045_823.musicxml' # 你的上傳檔名

if not os.path.exists(xml_file):
    print(f"錯誤：找不到檔案 {xml_file}，請檢查路徑。")
    exit()

print(f"正在解析檔案: {xml_file} ...")
score = music21.converter.parse(xml_file)

# 2. 核心分析邏輯 (處理你要求的括號格式)
def analyze_part(part, name):
    print(f"\n--- {name} 分析結果 ---")
    # flatten() 會把所有小節裡的音符鋪平，方便計算時間軸
    elements = part.flatten().notesAndRests
    
    output = []
    for el in elements:
        duration = float(el.quarterLength) # 取得佔有的拍數 (1.0 = 四分音符)
        
        if el.isRest:
            output.append(f"R{duration}")
        elif el.isNote:
            # 單音格式: (音名, 拍數)
            output.append(f"({el.pitch.nameWithOctave}, {duration})")
        elif el.isChord:
            # 和弦格式: (音1,音2,音3, 拍數)
            pitches = ",".join([p.nameWithOctave for p in el.pitches])
            output.append(f"({pitches}, {duration})")
            
    print(" ".join(output))

# 3. 執行左右手拆分
# 根據你的 XML，P1 是右手，P2 是左手
parts = score.parts
if len(parts) >= 2:
    analyze_part(parts[0], "右手 (Part 1)")
    analyze_part(parts[1], "左手 (Part 2)")
else:
    analyze_part(parts[0], "單軌數據")

# 4. 強制轉換並儲存 MIDI
output_midi = "output_result.mid"
score.write('midi', fp=output_midi)
print(f"\n[成功] MIDI 檔案已生成：{output_midi}")
print("[提醒] 你現在可以用 MIDI 播放器聽聽看左右手是否同步。")