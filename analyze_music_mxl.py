import music21
import os
import glob
import re

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

def batch_convert_and_merge(folder_path="."):
    mxl_files = glob.glob(os.path.join(folder_path, "*.mxl"))
    mxl_files.sort(key=natural_sort_key)
    
    if not mxl_files:
        print("❌ 找不到任何 .mxl 檔案！")
        return
        
    num_files = len(mxl_files)
    # 輸出新檔名以利區隔
    output_file = f"combined_{num_files}_mxl_compat.mid"
    
    print(f"📂 總共找到 {num_files} 個 MXL 檔案。")
    print(f"🚀 啟動【高相容性單軌 Type 0 MIDI 輸出版】...\n")
    
    # 💡 關鍵修改：直接使用單一 Stream，不層層嵌套 Score/Part
    # 這會強迫寫出 Type 0 MIDI，讓所有網頁播放器都能直接讀到音符
    master_stream = music21.stream.Stream()
    master_stream.insert(0, music21.tempo.MetronomeMark(number=125))
    master_stream.insert(0, music21.instrument.Piano())
    
    current_offset = 0.0
    GAP_RATIO = 0.9
    
    for input_file in mxl_files:
        file_name = os.path.basename(input_file)
        try:
            score = music21.converter.parse(input_file)
            notes_found = 0
            max_note_end = 0.0
            
            for el in score.recurse().notes:
                if el.isChord:
                    pitches = [p for p in el.pitches]
                    if not pitches: continue
                    clean_el = music21.chord.Chord(pitches)
                elif el.isNote:
                    clean_el = music21.note.Note(el.pitch)
                else:
                    continue
                    
                notes_found += 1
                clean_el.volume.velocity = 95  # 稍微調大音量
                clean_el.duration.quarterLength = el.duration.quarterLength * GAP_RATIO
                
                abs_offset = el.getOffsetInHierarchy(score)
                note_end = abs_offset + el.duration.quarterLength
                if note_end > max_note_end:
                    max_note_end = note_end
                    
                # 全部直接寫入主軌道
                master_stream.insert(current_offset + abs_offset, clean_el)
            
            page_length = score.flat.highestTime
            if page_length == 0 or page_length < max_note_end:
                page_length = max_note_end
            if page_length == 0:
                page_length = 4.0
                
            print(f"📊 檔案: {file_name:<12} | 成功提取音符: {notes_found:<4} | 頁面長度: {page_length:<5} 拍 | 目前總進度: {current_offset:.1f} 拍")
            current_offset += page_length
            
        except Exception as e:
            print(f"❌ 處理 {file_name} 時發生錯誤: {e}")
            
    print(f"\n🎬 正在封裝為高相容性單軌 MIDI 檔案...")
    try:
        master_stream.write('midi', fp=output_file)
        print(f"🎉【大功告成】全新高相容性 MIDI 檔案已產出！")
        print(f"💾 最終產出檔案: {output_file}")
    except Exception as e:
        print(f"❌ 封裝 MIDI 失敗: {e}")

if __name__ == "__main__":
    batch_convert_and_merge()