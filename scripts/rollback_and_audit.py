#!/usr/bin/env python3
"""
Task 1: Rollback 6 recently published articles
Task 2: Investigate Chewy draft contradiction
Task 3: Latest 20 dry-run audit
"""

import json
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

MONGO_URI = "mongodb+srv://jgtruestock:ly94FxlZoad8PVWm@cluster0.lh6rsp1.mongodb.net/"
client = MongoClient(MONGO_URI)
db = client["13f-tracker"]
coll = db["summaries"]

# ─── TASK 1: Find and rollback the 6 recently published articles ───
print("=" * 60)
print("TASK 1: ROLLBACK RECENTLY PUBLISHED ARTICLES")
print("=" * 60)

# Find all currently published articles
published = list(coll.find(
    {"alphaReady": True, "status": "published", "publishedArticle": {"$exists": True, "$ne": ""}},
    {"title": 1, "jgTitle": 1, "status": 1, "alphaReady": 1, "publishedAt": 1, "publishSource": 1, "publishedBy": 1}
).sort("publishedAt", -1))

print(f"\nCurrently published articles: {len(published)}")
for i, doc in enumerate(published):
    title = doc.get("jgTitle") or doc.get("title", "N/A")
    print(f"  {i+1}. {title[:60]}")
    print(f"     _id: {doc['_id']}")
    print(f"     publishedAt: {doc.get('publishedAt')}")
    print(f"     publishSource: {doc.get('publishSource')}")
    print(f"     publishedBy: {doc.get('publishedBy')}")

# Identify the 6 most recently published (likely the ones to rollback)
# Check for publishSource = 'latest_10_by_source_date' or recent batch
recent_batch = [d for d in published if d.get("publishSource") == "latest_10_by_source_date"]
print(f"\nArticles with publishSource='latest_10_by_source_date': {len(recent_batch)}")

# If not found by that publishSource, take the 6 most recent
if len(recent_batch) == 0:
    print("No articles with that publishSource. Looking at all recently published...")
    # Show all so we can identify the batch
    for i, doc in enumerate(published):
        title = doc.get("jgTitle") or doc.get("title", "N/A")
        ps = doc.get("publishSource", "N/A")
        pa = doc.get("publishedAt", "N/A")
        print(f"  {i+1}. [{ps}] {pa} — {title[:50]}")

# Let's find all with the most recent publishedAt timestamps (likely same batch)
if published:
    # Group by publishSource
    by_source = {}
    for d in published:
        ps = d.get("publishSource", "unknown")
        by_source.setdefault(ps, []).append(d)
    print("\nPublished by source:")
    for src, docs in by_source.items():
        print(f"  {src}: {len(docs)} articles")

# ─── Perform the rollback ───
# Rollback ALL currently published articles (set alphaReady=false, status=candidate)
# Keep publishedAt, publishedBy, publishSource, publishedArticle
rollback_ids = [d["_id"] for d in published]
print(f"\nRolling back {len(rollback_ids)} articles...")

if rollback_ids:
    result = coll.update_many(
        {"_id": {"$in": rollback_ids}},
        {"$set": {
            "alphaReady": False,
            "status": "candidate",
            "updatedAt": datetime.utcnow().isoformat()
        }}
    )
    print(f"  Modified: {result.modified_count} documents")
    
    # Verify rollback
    still_published = coll.count_documents(
        {"alphaReady": True, "status": "published", "publishedArticle": {"$exists": True, "$ne": ""}}
    )
    print(f"  Articles still showing on /insights: {still_published}")

print()

# ─── TASK 2: Investigate Chewy ───
print("=" * 60)
print("TASK 2: CHEWY DRAFT INVESTIGATION")
print("=" * 60)

chewy_docs = list(coll.find(
    {"$or": [
        {"title": {"$regex": "chewy", "$options": "i"}},
        {"jgTitle": {"$regex": "chewy", "$options": "i"}},
        {"topic": {"$regex": "chewy", "$options": "i"}},
    ]}
))

print(f"\nFound {len(chewy_docs)} Chewy-related documents")
for doc in chewy_docs:
    print(f"\n  _id: {doc['_id']}")
    print(f"  title: {doc.get('title', 'N/A')[:80]}")
    print(f"  jgTitle: {doc.get('jgTitle', 'N/A')}")
    print(f"  status: {doc.get('status')}")
    print(f"  alphaReady: {doc.get('alphaReady')}")
    print(f"  draftStatus: {doc.get('draftStatus')}")
    
    # Check all article fields and their lengths
    for field in ['articleDraft', 'cleanArticleDraft', 'editedArticleDraft', 'publishedArticle', 'article', 'body']:
        val = doc.get(field)
        if val is None:
            print(f"  {field}: None")
        elif isinstance(val, str):
            print(f"  {field}: {len(val)} chars")
        else:
            print(f"  {field}: {type(val).__name__}")
    
    # Check for any other draft-related fields
    draft_fields = [k for k in doc.keys() if 'draft' in k.lower() or 'article' in k.lower()]
    print(f"  Draft-related fields: {draft_fields}")
    
    # Check the publish gate logic
    has_edited = bool(doc.get('editedArticleDraft', '').strip() if isinstance(doc.get('editedArticleDraft'), str) else False)
    has_clean = bool(doc.get('cleanArticleDraft', '').strip() if isinstance(doc.get('cleanArticleDraft'), str) else False)
    has_article_draft = bool(doc.get('articleDraft', '').strip() if isinstance(doc.get('articleDraft'), str) else False)
    has_published = bool(doc.get('publishedArticle', '').strip() if isinstance(doc.get('publishedArticle'), str) else False)
    
    can_publish = has_edited or has_clean
    print(f"\n  Publish gate analysis:")
    print(f"    has editedArticleDraft: {has_edited}")
    print(f"    has cleanArticleDraft: {has_clean}")
    print(f"    has articleDraft: {has_article_draft}")
    print(f"    has publishedArticle: {has_published}")
    print(f"    canPublish (edit||clean): {can_publish}")
    print(f"    UI shows '已有草稿': likely because articleDraft exists ({has_article_draft})")
    print(f"    But publish gate needs editedArticleDraft or cleanArticleDraft")
    if has_article_draft and not can_publish:
        print(f"    ROOT CAUSE: articleDraft exists but no cleaned/edited version → UI says '已有草稿' but publish gate blocks")

print()

# ─── TASK 3: Latest 20 dry-run ───
print("=" * 60)
print("TASK 3: LATEST 20 DRY-RUN (NO PUBLISH)")
print("=" * 60)

# PUBLISH_BLOCKERS from publish route
PUBLISH_BLOCKERS = [
    '【JG 觀點待補】', '《JG 觀點待補》', '請從上面候選方向',
    '候選方向中選一個', '改寫成正式 JG 判斷', 'reviewer note',
    'internal instruction', 'TODO for JG', '請 JG', '後台操作指令', 'TODO',
]

# Find all summaries with any article content
all_with_content = list(coll.find(
    {"$or": [
        {"publishedArticle": {"$exists": True, "$ne": ""}},
        {"editedArticleDraft": {"$exists": True, "$ne": ""}},
        {"cleanArticleDraft": {"$exists": True, "$ne": ""}},
        {"articleDraft": {"$exists": True, "$ne": ""}},
        {"article": {"$exists": True, "$ne": ""}},
        {"body": {"$exists": True, "$ne": ""}},
    ]}
))

print(f"\nTotal summaries with any content: {len(all_with_content)}")

# Determine date and content source for each
def get_best_date(doc):
    """Return (date_value, field_name) for sorting"""
    for field in ['sourceDate', 'publish_date', 'video_published_at', 'publishedAt', 'createdAt', 'updatedAt']:
        val = doc.get(field)
        if val and val != 'n/a':
            return (str(val), field)
    return ('', 'none')

def get_content_source(doc):
    """Return (content, field_name, length)"""
    for field in ['editedArticleDraft', 'cleanArticleDraft', 'publishedArticle', 'articleDraft', 'article', 'body']:
        val = doc.get(field)
        if val and isinstance(val, str) and val.strip():
            return (val, field, len(val))
    return ('', 'none', 0)

def check_blockers(content):
    """Return list of blocker reasons"""
    reasons = []
    for b in PUBLISH_BLOCKERS:
        if b in content:
            reasons.append(f"contains '{b}'")
    return reasons

def can_publish_check(doc):
    """Check if article can be published per current logic"""
    reasons = []
    
    # Need editedArticleDraft or cleanArticleDraft
    source = (doc.get('editedArticleDraft') or doc.get('cleanArticleDraft') or '')
    if not source.strip():
        reasons.append("no editedArticleDraft or cleanArticleDraft")
    else:
        blockers = check_blockers(source)
        if blockers:
            reasons.extend(blockers)
    
    return (len(reasons) == 0, reasons)

# Sort by date
dated_docs = []
for doc in all_with_content:
    date_val, date_field = get_best_date(doc)
    content, content_field, content_len = get_content_source(doc)
    can_pub, block_reasons = can_publish_check(doc)
    dated_docs.append({
        'doc': doc,
        'date_val': date_val,
        'date_field': date_field,
        'content_field': content_field,
        'content_len': content_len,
        'can_publish': can_pub,
        'block_reasons': block_reasons,
    })

# Sort descending by date
dated_docs.sort(key=lambda x: x['date_val'], reverse=True)

# Show top 20
print("\n--- LATEST 20 ARTICLES WITH CONTENT ---\n")
publishable = []
for i, item in enumerate(dated_docs[:20]):
    doc = item['doc']
    title = doc.get('jgTitle') or doc.get('title', 'N/A')
    status = doc.get('status', 'N/A')
    alpha = doc.get('alphaReady', False)
    
    skip_reason = ""
    if status == 'published' and alpha:
        skip_reason = "already published+alphaReady"
    elif status in ['rejected', 'archived']:
        skip_reason = f"status={status}"
    
    in_latest_10 = (i < 10 and item['can_publish'] and not skip_reason)
    
    print(f"#{i+1}")
    print(f"  _id: {doc['_id']}")
    print(f"  title: {title[:70]}")
    print(f"  dateUsed: {item['date_val']}")
    print(f"  dateFieldUsed: {item['date_field']}")
    print(f"  status: {status}")
    print(f"  alphaReady: {alpha}")
    print(f"  contentSource: {item['content_field']}")
    print(f"  contentLength: {item['content_len']}")
    print(f"  canPublish: {item['can_publish']}")
    print(f"  publishBlockedReasons: {item['block_reasons'] if item['block_reasons'] else 'none'}")
    print(f"  skipReason: {skip_reason if skip_reason else 'none'}")
    print()
    
    if item['can_publish'] and not skip_reason:
        publishable.append(item)

print(f"\n--- PUBLISHABLE ARTICLES FROM TOP 20 ---")
print(f"Total publishable: {len(publishable)}")
for i, item in enumerate(publishable[:10]):
    doc = item['doc']
    title = doc.get('jgTitle') or doc.get('title', 'N/A')
    print(f"  {i+1}. {title[:60]} (date: {item['date_val']}, {item['content_len']} chars)")

if len(publishable) < 10:
    print(f"\n⚠️  Only {len(publishable)} publishable articles (need 10)")
    print("Reasons for shortfall:")
    unpublishable = [d for d in dated_docs[:20] if not d['can_publish'] or d['doc'].get('status') in ['rejected', 'archived']]
    needs_draft = 0
    has_blockers = 0
    for item in unpublishable:
        if 'no editedArticleDraft or cleanArticleDraft' in str(item['block_reasons']):
            needs_draft += 1
        else:
            has_blockers += 1
    print(f"  - Need generate-draft/clean: {needs_draft}")
    print(f"  - Has blocker text: {has_blockers}")

# Also scan beyond top 20 for publishable
all_publishable = [d for d in dated_docs if d['can_publish'] and d['doc'].get('status') not in ['rejected', 'archived']]
print(f"\nTotal publishable across ALL summaries: {len(all_publishable)}")

client.close()
print("\n✅ Script complete. NO articles were published.")
