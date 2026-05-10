
import music21
import os

def combine_music_files():
    """
    This script automatically detects and combines all .musicxml files in the 
    current directory into a single MIDI file and generates a report.
    """
    
    # --- 設定 ---
    source_dir = '.'  # We are in the 'music_work' directory
    output_mid_prefix = 'combined_all'
    output_txt_prefix = 'combined_all_report'
    
    # --- 自動偵測 musicxml 檔案 ---
    files_to_combine = [f for f in os.listdir(source_dir) if f.endswith('.musicxml')]
    if not files_to_combine:
        print("⚠️ 在 'music_work' 資料夾中沒有找到任何 .musicxml 檔案。")
        return

    # Sort files to ensure a consistent order
    files_to_combine.sort()

    output_mid = f"{output_mid_prefix}.mid"
    output_txt = f"{output_txt_prefix}.txt"

    print(f"--- 開始進行 {len(files_to_combine)} 個檔案合併 ---")
    print(f"檔案列表: {files_to_combine}")

    # --- 初始化 ---
    combined_score = music21.stream.Score()
    combined_right = music21.stream.Part(id='RightHand')
    combined_left = music21.stream.Part(id='LeftHand')
    report = []

    # --- 處理每個檔案 ---
    for f_name in files_to_combine:
        file_path = os.path.join(source_dir, f_name)
        if not os.path.exists(file_path):
            print(f"⚠️ 找不到: {f_name}")
            continue

        print(f"正在處理: {f_name}...")
        try:
            score = music21.converter.parse(file_path)
            
            # --- 分離左右手 ---
            # 假設第一個 Part 是右手，第二個是左手
            if len(score.parts) > 0:
                for n in score.parts[0].recurse().notesAndRests:
                    combined_right.append(n)
            
            if len(score.parts) > 1:
                for n in score.parts[1].recurse().notesAndRests:
                    combined_left.append(n)

            # --- 生成報告 ---
            report.append(f"\n=== {f_name} ===")
            for i, part in enumerate(score.parts):
                tags = [f"軌{i+1}:"]
                for el in part.recurse().notesAndRests:
                    if el.isNote and el.tie and el.tie.type == 'stop': continue
                    d = float(el.quarterLength)
                    
                    if el.isRest:
                        tags.append(f"R{d}")
                    elif el.isNote:
                        tags.append(f"({el.pitch.nameWithOctave}, {d})")
                    elif el.isChord:
                        ps = ",".join([p.nameWithOctave for p in el.pitches])
                        tags.append(f"({ps}, {d})")
                report.append(" ".join(tags))
        except Exception as e:
            print(f"❌ 處理 {f_name} 時發生錯誤: {e}")

    # --- 合併與設定 ---
    # 在樂譜開頭插入速度標記 (120 BPM)
    combined_score.insert(0, music21.tempo.MetronomeMark(number=120))
    # 將左右手部分插入樂譜
    combined_score.insert(0, combined_right)
    combined_score.insert(0, combined_left)

    # --- 存檔 ---
    try:
        combined_score.write('midi', fp=os.path.join(source_dir, output_mid))
        with open(os.path.join(source_dir, output_txt), 'w', encoding='utf-8') as f:
            f.write("\n".join(report))
        print(f"\n✅ {len(files_to_combine)} 個檔案合併成功！")
        print(f"產出 MIDI: {output_mid} (大小: {os.path.getsize(os.path.join(source_dir, output_mid))} bytes)")
        print(f"產出報告: {output_txt} (大小: {os.path.getsize(os.path.join(source_dir, output_txt))} bytes)")
    except Exception as e:
        print(f"❌ 存檔失敗: {e}")

if __name__ == "__main__":
    combine_music_files()
