import music21
import os

# 只鎖定 1 到 4 號檔案
files_to_combine = [
    '1.musicxml', 
    '2.musicxml', 
    '3.musicxml', 
    '4.musicxml'
]

output_mid = 'combined_4.mid'
output_txt = 'combined_4_report.txt'

def combine_four():
    print("--- 開始進行 1 到 4 號檔案合併 ---")
    combined_score = music21.stream.Score()
    combined_right = music21.stream.Part(id='RightHand')
    combined_left = music21.stream.Part(id='LeftHand')
    report = []

    for f_name in files_to_combine:
        if not os.path.exists(f_name):
            print(f"⚠️ 找不到: {f_name}")
            continue

        print(f"正在處理: {f_name}...")
        try:
            score = music21.converter.parse(f_name)
            
            # 右手
            for n in score.parts[0].recurse().notesAndRests:
                combined_right.append(n)
            
            # 左手
            if len(score.parts) > 1:
                for n in score.parts[1].recurse().notesAndRests:
                    combined_left.append(n)

            # 報告
            report.append(f"\n=== {f_name} ===")
            for i, part in enumerate(score.parts):
                tags = [f"軌{i+1}:"]
                for el in part.recurse().notesAndRests:
                    if el.isNote and el.tie and el.tie.type == 'stop': continue
                    d = float(el.quarterLength)
                    if el.isRest: tags.append(f"R{d}")
                    elif el.isNote: tags.append(f"({el.pitch.nameWithOctave}, {d})")
                    elif el.isChord:
                        ps = ",".join([p.nameWithOctave for p in el.pitches])
                        tags.append(f"({ps}, {d})")
                report.append(" ".join(tags))
        except Exception as e:
            print(f"❌ 錯誤 {f_name}: {e}")

    # 加入速度
    combined_score.insert(0, music21.tempo.MetronomeMark(number=120))
    combined_score.insert(0, combined_right)
    combined_score.insert(0, combined_left)

    # 存檔
    try:
        combined_score.write('midi', fp=output_mid)
        with open(output_txt, 'w', encoding='utf-8') as f:
            f.write("\n".join(report))
        print(f"\n✅ 4 檔合體大成功！")
        print(f"產出 MIDI: {output_mid} (大小: {os.path.getsize(output_mid)} bytes)")
        print(f"產出報告: {output_txt} (大小: {os.path.getsize(output_txt)} bytes)")
    except Exception as e:
        print(f"❌ 存檔失敗: {e}")

if __name__ == "__main__":
    combine_four()