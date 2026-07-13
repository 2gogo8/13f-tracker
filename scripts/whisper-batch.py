#!/usr/bin/env python3
"""
whisper-batch.py — 自動化批量 Whisper 字幕抓取
1. 從 MongoDB 撈 status=queued + enrichmentStatus=pending 的 expert_insights
2. yt-dlp 下載音頻
3. Whisper base 跑字幕
4. 存進 video_transcripts collection
5. 更新 expert_insights.enrichmentStatus = 'enriched' 觸發後續 LLM 處理

Usage:
  python3 scripts/whisper-batch.py [--dry-run] [--limit N] [--model base|small]
"""

import os, sys, re, json, subprocess, tempfile, time
from datetime import datetime
from pathlib import Path

# ── 讀取環境 ─────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / '.env.local'
env_content = env_path.read_text()
MONGO_URI = re.search(r'MONGO_URI=(.*)', env_content).group(1).strip()

from pymongo import MongoClient

# ── 參數解析 ─────────────────────────────────────────────────────────────────
args = sys.argv[1:]
DRY_RUN = '--dry-run' in args
LIMIT = 33
MODEL = 'base'
for i, a in enumerate(args):
    if a == '--limit' and i+1 < len(args): LIMIT = int(args[i+1])
    if a == '--model' and i+1 < len(args): MODEL = args[i+1]

print(f"🎙️  Whisper Batch — {'DRY RUN' if DRY_RUN else 'LIVE'} — model:{MODEL} limit:{LIMIT}")
print(f"   Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

# ── MongoDB ──────────────────────────────────────────────────────────────────
client = MongoClient(MONGO_URI)
db = client['13f-tracker']
ei_col = db['expert_insights']
vt_col = db['video_transcripts']

# 撈待處理的 items
items = list(ei_col.find({
    'status': 'queued',
    'enrichmentStatus': 'pending',
    'youtube_id': {'$exists': True, '$ne': None, '$nin': ['', 'N/A']}
}).sort('createdAt', -1).limit(LIMIT))

print(f"Found {len(items)} items to process\n")

results = {'done': 0, 'skipped': 0, 'error': 0}

for idx, doc in enumerate(items):
    vid_id = doc['youtube_id']
    title = doc.get('video_title') or doc.get('title') or vid_id
    channel = doc.get('channel') or ''
    doc_id = doc['_id']

    print(f"[{idx+1}/{len(items)}] {title[:70]}")
    print(f"  youtube_id: {vid_id} | channel: {channel[:40]}")

    # 已有 cached transcript？跳過
    existing = vt_col.find_one({'youtube_id': vid_id, 'fullTranscript': {'$exists': True, '$ne': None}})
    if existing and len(existing.get('fullTranscript', '')) > 100:
        print(f"  ✅ Already cached ({len(existing['fullTranscript'])} chars), marking enriched")
        if not DRY_RUN:
            ei_col.update_one({'_id': doc_id}, {'$set': {
                'enrichmentStatus': 'enriched',
                'workerInputSource': 'cached',
                'updatedAt': datetime.utcnow()
            }})
        results['skipped'] += 1
        continue

    if DRY_RUN:
        print(f"  DRY RUN: would download + whisper")
        continue

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, f"{vid_id}.m4a")
        txt_path = os.path.join(tmpdir, f"{vid_id}.txt")

        # Step 1: 下載音頻
        print(f"  📥 Downloading audio...")
        dl_cmd = [
            'yt-dlp', '-f', 'bestaudio[ext=m4a]/bestaudio',
            '--no-playlist', '-o', audio_path,
            f'https://www.youtube.com/watch?v={vid_id}'
        ]
        dl_result = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=300)
        if dl_result.returncode != 0 or not os.path.exists(audio_path):
            print(f"  ❌ Download failed: {dl_result.stderr[-200:]}")
            ei_col.update_one({'_id': doc_id}, {'$set': {
                'enrichmentStatus': 'error',
                'enrichmentError': 'audio_download_failed',
                'updatedAt': datetime.utcnow()
            }})
            results['error'] += 1
            continue

        size_mb = os.path.getsize(audio_path) / 1024 / 1024
        print(f"  ✅ Downloaded {size_mb:.1f}MB")

        # Step 2: Whisper 跑字幕
        print(f"  🎙️  Running Whisper ({MODEL})...")
        t0 = time.time()
        whisper_cmd = [
            'whisper', audio_path,
            '--model', MODEL,
            '--language', 'en',
            '--output_format', 'txt',
            '--output_dir', tmpdir
        ]
        w_result = subprocess.run(whisper_cmd, capture_output=True, text=True, timeout=7200)
        elapsed = time.time() - t0

        if w_result.returncode != 0:
            print(f"  ❌ Whisper failed: {w_result.stderr[-200:]}")
            ei_col.update_one({'_id': doc_id}, {'$set': {
                'enrichmentStatus': 'error',
                'enrichmentError': 'whisper_failed',
                'updatedAt': datetime.utcnow()
            }})
            results['error'] += 1
            continue

        # 讀取字幕
        txt_file = os.path.join(tmpdir, f"{vid_id}.txt")
        if not os.path.exists(txt_file):
            # 找任何 .txt 檔
            txts = [f for f in os.listdir(tmpdir) if f.endswith('.txt')]
            if txts:
                txt_file = os.path.join(tmpdir, txts[0])
            else:
                print(f"  ❌ No txt output found")
                results['error'] += 1
                continue

        full_transcript = open(txt_file).read().strip()
        print(f"  ✅ Whisper done in {elapsed:.0f}s → {len(full_transcript)} chars")

        # Step 3: 存進 video_transcripts
        vt_col.update_one(
            {'youtube_id': vid_id},
            {'$set': {
                'youtube_id': vid_id,
                'fullTranscript': full_transcript,
                'transcriptLength': len(full_transcript),
                'transcriptSource': 'whisper-batch',
                'whisperModel': MODEL,
                'fetchedAt': datetime.utcnow().isoformat(),
                'updatedAt': datetime.utcnow()
            }},
            upsert=True
        )

        # Step 4: 更新 expert_insights 觸發 LLM enrichment
        ei_col.update_one({'_id': doc_id}, {'$set': {
            'enrichmentStatus': 'enriched',
            'workerInputSource': 'whisper',
            'updatedAt': datetime.utcnow()
        }})

        print(f"  💾 Saved to MongoDB")
        results['done'] += 1

print(f"\n📊 Results: {results}")
print(f"   Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
client.close()
