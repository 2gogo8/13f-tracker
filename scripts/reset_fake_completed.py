#!/usr/bin/env python3
"""
reset_fake_completed.py

Resets 13 fake-completed summaries back to partial status so they can be retried.
Also resets their insight_chunks to pending.

Usage:
  python3 reset_fake_completed.py --dry-run   # show what would change
  python3 reset_fake_completed.py             # execute the reset
"""

import sys
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

# Load .env.local
env_path = Path(__file__).parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv('MONGODB_URI') or os.getenv('MONGO_URI')
if not MONGO_URI:
    print("ERROR: MONGODB_URI not found in .env.local")
    sys.exit(1)

DRY_RUN = '--dry-run' in sys.argv

FAKE_COMPLETED_IDS = [
    '6a3bbe2a81dd0e9698682cc8',
    '6a3bc88a81dd0e9698688536',
    '6a3c53b281dd0e969868859e',
    '6a3c540981dd0e96986885a1',
    '6a3c61a781dd0e96986885a2',
    '6a3c64bf81dd0e96986885a6',
    '6a3c675d81dd0e96986885a7',
    '6a3c681581dd0e96986885aa',
    '6a3ce0184aae4950b871e730',
    '6a3ce0184aae4950b871e731',
    '6a3ce0194aae4950b871e732',
    '6a3e86db24c139ca2a1273b3',
    '6a401c1224c139ca2a184fc4',
]

def main():
    client = MongoClient(MONGO_URI)
    db = client['13f-tracker']
    summaries = db['summaries']
    chunks = db['insight_chunks']

    object_ids = [ObjectId(id_str) for id_str in FAKE_COMPLETED_IDS]

    # Show current state
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Checking {len(object_ids)} fake-completed summaries...\n")

    docs = list(summaries.find({'_id': {'$in': object_ids}}, {
        '_id': 1, 'jgTitle': 1, 'title': 1, 'keyInsightsV2Status': 1,
        'insightsCount': 1, 'coveragePercent': 1, 'processedChunks': 1,
        'failedChunks': 1, 'keyInsightsV2': 1
    }))

    print(f"Found {len(docs)} summaries in DB (expected {len(FAKE_COMPLETED_IDS)})\n")
    print("-" * 80)
    for doc in docs:
        title = doc.get('jgTitle') or doc.get('title') or '(no title)'
        v2_len = len(doc.get('keyInsightsV2') or [])
        print(f"  {doc['_id']}  {title[:50]}")
        print(f"    status={doc.get('keyInsightsV2Status')}  insightsCount={doc.get('insightsCount')}  "
              f"coverage={doc.get('coveragePercent')}%  processedChunks={doc.get('processedChunks')}  "
              f"failedChunks={doc.get('failedChunks')}  keyInsightsV2.len={v2_len}")

    # Check chunks
    chunk_count = chunks.count_documents({'summaryId': {'$in': object_ids}})
    print(f"\nTotal insight_chunks for these 13 summaries: {chunk_count}")

    # Count chunks by status
    pipeline = [
        {'$match': {'summaryId': {'$in': object_ids}}},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    for r in chunks.aggregate(pipeline):
        print(f"  chunks status={r['_id']}: {r['count']}")

    if len(docs) != len(FAKE_COMPLETED_IDS):
        print(f"\nWARNING: Only found {len(docs)}/{len(FAKE_COMPLETED_IDS)} summaries!")
        missing = set(FAKE_COMPLETED_IDS) - {str(d['_id']) for d in docs}
        for m in missing:
            print(f"  MISSING: {m}")

    print("\n" + "=" * 80)
    print("PLAN:")
    print(f"  summaries ({len(docs)} docs): keyInsightsV2Status → 'partial', coveragePercent → 0,")
    print(f"    processedChunks → 0, keyInsightsV2 → [], insightsCount → 0")
    print(f"  insight_chunks ({chunk_count} docs): status → 'pending'")

    if DRY_RUN:
        print("\n[DRY RUN] No changes made. Remove --dry-run to execute.")
        return

    print("\nExecuting reset...")

    # Reset summaries
    summary_result = summaries.update_many(
        {'_id': {'$in': object_ids}},
        {'$set': {
            'keyInsightsV2Status': 'partial',
            'coveragePercent': 0,
            'processedChunks': 0,
            'failedChunks': 0,
            'keyInsightsV2': [],
            'insightsCount': 0,
            'keyInsightsV2Count': 0,
            'updatedAt': datetime.utcnow(),
        }}
    )
    print(f"  ✅ summaries updated: {summary_result.modified_count}/{len(object_ids)}")

    # Reset insight_chunks to pending
    chunks_result = chunks.update_many(
        {'summaryId': {'$in': object_ids}},
        {'$set': {
            'status': 'pending',
            'generatedInsights': [],
            'error': None,
            'updatedAt': datetime.utcnow(),
        }}
    )
    print(f"  ✅ insight_chunks reset to pending: {chunks_result.modified_count}/{chunk_count}")

    print("\n✅ Reset complete. Ready for retry with: npm run insights:v2 -- --all-partial --resume")

    client.close()

if __name__ == '__main__':
    main()
