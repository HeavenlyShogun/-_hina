import json
import re
import sys
from pathlib import Path
import music21

# 確保輸出終端機編碼正確
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

PPQ = 10080  # 高精度播放解析度

def get_sorted_musicxml_files(directory: Path):
    """自動抓取並智慧排序資料夾內所有的 .musicxml"""
    files = list(directory.glob("*.musicxml"))

    def sort_key(filepath):
        numbers = re.findall(r"\d+", filepath.name)
        return (0, int(numbers[0])) if numbers else (1, filepath.name)

    return sorted(files, key=sort_key)


def resolve_musicxml_directory() -> Path:
    """尋找包含 musicxml 的正確資料夾路徑"""
    script_dir = Path(__file__).resolve().parent
    cwd = Path.cwd()
    
    candidates = [
        cwd,
        script_dir,
        cwd / "music_work",
        script_dir / "music_work",
    ]

    for d in candidates:
        if d.exists() and any(d.glob("*.musicxml")):
            return d

    return cwd


def process_element(element, base_offset, track_id, events_list):
    """將 music21 的音符轉為 [start, duration, note, vel, track] Tuple"""
    absolute_offset = base_offset + float(element.offset)

    # 關鍵修正：使用 round() 避免浮點數造成的 Tick 遺失
    start_tick = round(absolute_offset * PPQ)
    duration_ticks = round(float(element.quarterLength) * PPQ)

    # 處理力度 (Velocity) 預設給 90，並常態化到 0.0 ~ 1.0 之間
    vel = element.volume.velocity if element.volume.velocity is not None else 90
    norm_vel = round(vel / 127.0, 2)

    if element.isNote:
        events_list.append([start_tick, duration_ticks, element.pitch.midi, norm_vel, track_id])
    elif element.isChord:
        for p in element.pitches:
            events_list.append([start_tick, duration_ticks, p.midi, norm_vel, track_id])


def combine_and_compress():
    musicxml_dir = resolve_musicxml_directory()
    files_to_combine = get_sorted_musicxml_files(musicxml_dir)
    file_count = len(files_to_combine)

    if file_count == 0:
        print(f"⚠️ 在 {musicxml_dir} 中找不到任何 .musicxml 檔案！請確認檔案位置。")
        return

    output_json_path = musicxml_dir / f"combined_{file_count}_slim.json"
    output_txt_path = musicxml_dir / f"combined_{file_count}_report.txt"

    print(f"--- 偵測到 {file_count} 個樂譜檔案，開始進行合併與極致壓縮 ---")
    report = []
    slim_events = []
    current_global_offset = 0.0

    for f_path in files_to_combine:
        print(f"正在處理: {f_path.name}...")
        try:
            score = music21.converter.parse(f_path)

            # 動態處理前兩個聲部 (通常是右手與左手)，並加上 .notes 過濾器加速迭代
            for i, part in enumerate(score.parts[:2]):
                track_id = i + 1
                flat_notes = part.stripTies().flatten().notes
                
                for n in flat_notes:
                    process_element(n, current_global_offset, track_id, slim_events)

            report.append(f"=== {f_path.name} 處理完成 ===")
            current_global_offset += score.highestTime

        except Exception as e:
            print(f"❌ 錯誤 {f_path.name}: {e}")
            report.append(f"❌ {f_path.name} 解析失敗: {e}")

    # 依照開始時間排序
    slim_events.sort(key=lambda x: x[0])

    # 組合 JSON 結構
    final_json = {
        "version": "3.2-ultra-slim",
        "ppq": PPQ,
        "metadata": {
            "id": f"combined-{file_count}-slim",
            "title": f"Combined {file_count} to Slim JSON",
        },
        "events": slim_events,
    }

    # 存檔
    try:
        with output_json_path.open("w", encoding="utf-8") as f:
            json.dump(final_json, f, separators=(",", ":"))

        with output_txt_path.open("w", encoding="utf-8") as f:
            f.write("\n".join(report))

        print(f"\n✅ {file_count} 檔合體並壓縮大成功！")
        print(f"產出 JSON: {output_json_path.name} (大小: {output_json_path.stat().st_size} bytes)")
        print(f"產出報告: {output_txt_path.name}")
        print(f"總音符數量: {len(slim_events)} 個實體音符")
    except Exception as e:
        print(f"❌ 存檔失敗: {e}")


if __name__ == "__main__":
    combine_and_compress()