import music21
import os
import json
import glob
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# ==========================================
# 1. 自動抓取並智慧排序資料夾內所有的 .musicxml
# ==========================================
def get_sorted_musicxml_files(directory=None):
    if directory is None:
        directory = "."

    # 抓取所有附檔名為 .musicxml 的檔案
    files = glob.glob(os.path.join(directory, "*.musicxml"))

    # 智慧排序函數：提取檔名中的數字來排，確保 2.musicxml 會在 10.musicxml 前面
    def sort_key(filepath):
        filename = os.path.basename(filepath)
        numbers = re.findall(r"\d+", filename)
        return (0, int(numbers[0])) if numbers else (1, filename)

    return sorted(files, key=sort_key)


def resolve_musicxml_directory():
    script_directory = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.getcwd(),
        script_directory,
        os.path.join(os.getcwd(), "music_work"),
        os.path.join(script_directory, "music_work"),
    ]

    for directory in candidates:
        if glob.glob(os.path.join(directory, "*.musicxml")):
            return directory

    return os.getcwd()


# 取得檔案列表與數量
musicxml_directory = resolve_musicxml_directory()
files_to_combine = get_sorted_musicxml_files(musicxml_directory)
file_count = len(files_to_combine)

# 動態設定輸出檔名 (例如有 15 個檔案，就會變成 combined_15_slim.json)
output_json = f"combined_{file_count}_slim.json"
output_txt = f"combined_{file_count}_report.txt"
output_json_path = os.path.join(musicxml_directory, output_json)
output_txt_path = os.path.join(musicxml_directory, output_txt)
PPQ = 10080  # 高精度播放解析度


def combine_and_compress():
    if file_count == 0:
        print("⚠️ 目前資料夾中找不到任何 .musicxml 檔案！請確認檔案位置。")
        return

    print(f"--- 偵測到 {file_count} 個樂譜檔案，開始進行合併與極致壓縮 ---")
    report = []
    slim_events = []

    # 記錄目前拼接的整體時間 (以四分音符為單位)
    current_global_offset = 0.0

    for f_name in files_to_combine:
        print(f"正在處理: {os.path.basename(f_name)}...")
        try:
            score = music21.converter.parse(f_name)

            # 取得左右手音軌。使用 stripTies() 自動合併連結線音符，flatten() 取得絕對時間
            right_part = score.parts[0].stripTies().flatten() if len(score.parts) > 0 else None
            left_part = score.parts[1].stripTies().flatten() if len(score.parts) > 1 else None

            # 處理右手 (trackId = 1)
            if right_part:
                for n in right_part.notes:
                    add_note_to_events(n, current_global_offset, 1, slim_events, report)

            # 處理左手 (trackId = 2)
            if left_part:
                for n in left_part.notes:
                    add_note_to_events(n, current_global_offset, 2, slim_events, report)

            report.append(f"\n=== {os.path.basename(f_name)} 處理完成 ===")

            # 將時間軸往前推進這份樂譜的總長度，讓下一份檔案能精準接上
            current_global_offset += score.highestTime

        except Exception as e:
            print(f"❌ 錯誤 {f_name}: {e}")

    # 依照開始時間 (Tick) 排序，確保播放引擎循序讀取順暢
    slim_events.sort(key=lambda x: x[0])

    # 組合 V3.2 Ultra-Slim 格式
    final_json = {
        "version": "3.2-ultra-slim",
        "ppq": PPQ,
        "metadata": {
            "id": f"combined-{file_count}-slim",
            "title": f"Combined {file_count} to Slim JSON",
        },
        "events": slim_events,
    }

    # 存檔 (使用 separators 移除多餘空白，極致壓縮體積)
    try:
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(final_json, f, separators=(",", ":"))

        with open(output_txt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(report))

        print(f"\n✅ {file_count} 檔合體並壓縮大成功！")
        print(f"產出 JSON: {output_json} (大小: {os.path.getsize(output_json_path)} bytes)")
        print(f"產出報告: {output_txt}")
        print(f"總音符數量: {len(slim_events)} 個實體音符")
    except Exception as e:
        print(f"❌ 存檔失敗: {e}")


def add_note_to_events(element, base_offset, track_id, events_list, report):
    """將 music21 的音符轉為 [start, duration, note, vel, track] Tuple"""
    # 算出全域時間
    absolute_offset = base_offset + float(element.offset)

    # 轉換為 Tick
    start_tick = int(absolute_offset * PPQ)
    duration_ticks = int(float(element.quarterLength) * PPQ)

    # 處理力度 (Velocity) 預設給 90，並常態化到 0.0 ~ 1.0 之間
    vel = element.volume.velocity if element.volume.velocity is not None else 90
    norm_vel = round(vel / 127.0, 2)

    # 如果是單音
    if element.isNote:
        events_list.append([start_tick, duration_ticks, element.pitch.midi, norm_vel, track_id])
    # 如果是和弦 (同時按下多個音)
    elif element.isChord:
        for p in element.pitches:
            events_list.append([start_tick, duration_ticks, p.midi, norm_vel, track_id])


if __name__ == "__main__":
    combine_and_compress()
