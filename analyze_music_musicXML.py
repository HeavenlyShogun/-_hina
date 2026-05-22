import music21
import os
import glob
import re
import copy

# 自然排序法，確保 1.musicxml -> 2.musicxml -> ... -> 22.musicxml 順序完全正確
def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

def batch_convert_and_merge(folder_path="."):
    # 1. 精確只抓取資料夾內所有的 .musicxml 檔案
    musicxml_files = glob.glob(os.path.join(folder_path, "*.musicxml"))
    musicxml_files.sort(key=natural_sort_key)
    
    if not musicxml_files:
        print("❌ 找不到任何 .musicxml 檔案！請確認檔案副檔名，並與程式放在同一個資料夾。")
        return
        
    num_files = len(musicxml_files)
    combined_output_file = f"combined_{num_files}_musicxml.mid"
    
    print(f"📂 總共找到 {num_files} 個 .musicxml 檔案。")
    print(f"🚀 開始執行【雙效轉換】（個別生成 .mid + 總體大合併）...")
    print(f"🎯 預定合併產出檔名: {combined_output_file}\n")
    
    # 建立大合併用的總主軌道
    master_score = music21.stream.Score()
    master_part = music21.stream.Part(id='Piano')
    
    current_offset = 0.0  # 記錄目前歌曲合併的時間軸（第幾拍）
    GAP_RATIO = 0.9       # 防卡鍵：縮短音符長度至 90%，保留 10% 空白給網頁感應放開
    
    for input_file in musicxml_files:
        base_name = os.path.splitext(os.path.basename(input_file))[0]
        individual_midi = f"{base_name}.mid"
        
        print(f"⏳ 正在處理: {input_file} ──> 預計轉換出: {individual_midi} ...")
        
        try:
            # 讀取原始樂譜
            score = music21.converter.parse(input_file)
            
            notes_found = 0
            # 使用 recurse() 深入所有聲部和小節，撈出這一頁所有的音符與和弦
            for el in score.recurse().notes:
                notes_found += 1
                
                # 【有聲修復】如果 OMR 軟體沒給音量或設成 0，強制給予標準音量 90
                if el.volume.velocity is None or el.volume.velocity == 0:
                    el.volume.velocity = 90
                
                # --- 以下為大合併處理邏輯 ---
                # 使用 deepcopy 複製音符，徹底解決 'replicate' 報錯
                new_el = copy.deepcopy(el)
                
                # 取得該音符在該頁樂譜的「絕對時間點（第幾拍）」
                abs_offset = el.getOffsetInHierarchy(score)
                
                # 優化網頁按鍵效果（創造斷奏微間隔）
                new_el.duration.quarterLength = new_el.duration.quarterLength * GAP_RATIO
                
                # 精準插入到合併總軌道的時間軸上
                master_part.insert(current_offset + abs_offset, new_el)
            
            # 寫出「個別的」MIDI 檔案
            score.write('midi', fp=individual_midi)
            print(f"   ├─ [成功] 單檔轉換完成！(偵測到 {notes_found} 個音符)")
            
            # 這一頁處理完後，將合併時間軸往後推「這一頁的總長度」
            page_length = score.duration.quarterLength
            current_offset += page_length
            print(f"   └─ [成功] 已加入總合併序列（此頁長度: {page_length} 拍）\n")
            
        except Exception as e:
            print(f"❌ 處理 {input_file} 時發生錯誤: {e}\n")
            
    # --- 輸出最終大合併檔案 ---
    # 設定整首歌曲的速度 (原曲約 125)
    master_score.insert(0, music21.tempo.MetronomeMark(number=125))
    master_score.insert(0, master_part)
    
    print(f"🎬 正在封裝最終的 {num_files} 頁大合併 MIDI 檔案...")
    try:
        master_score.write('midi', fp=combined_output_file)
        print(f"\n🎉【全數完美大成功】全部檔案處理完畢！")
        print(f"💾 獨立 MIDI 檔：已全數產出 (1.mid ~ {num_files}.mid)")
        print(f"💾 總合併 MIDI 檔：{combined_output_file}")
    except Exception as e:
        print(f"❌ 封裝合併 MIDI 失敗: {e}")

if __name__ == "__main__":
    batch_convert_and_merge()