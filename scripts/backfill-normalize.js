#!/usr/bin/env node
/**
 * Backfill Normalize — Adds unified source schema fields to expert_insights.
 *
 * Usage:
 *   node scripts/backfill-normalize.js              # default --dry-run
 *   node scripts/backfill-normalize.js --dry-run     # report only
 *   node scripts/backfill-normalize.js --execute     # write to DB
 *
 * Requires .env.local with MONGO_URI
 */

import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    execute:   { type: 'boolean', default: false },
    help:      { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Backfill Normalize — Adds unified source schema fields to expert_insights.

Usage:
  node scripts/backfill-normalize.js              # default --dry-run
  node scripts/backfill-normalize.js --dry-run     # report only
  node scripts/backfill-normalize.js --execute     # write to DB
`);
  process.exit(0);
}

const isExecute = args.execute === true;
const isDryRun = !isExecute; // default is dry-run

// ── Load env ───────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env.local', 'utf8');
const mongoUri = envContent.match(/MONGO_URI=(.*)/)?.[1]?.trim();
if (!mongoUri) {
  console.error('❌ Missing MONGO_URI in .env.local');
  process.exit(1);
}

// ── Source type mapping ────────────────────────────────────────────────────────
function mapSourceType(rawType, doc) {
  if (!rawType || rawType === '') {
    // fallback: if has youtube_id → youtube, else expert_pipeline
    return doc.youtube_id ? 'youtube' : 'expert_pipeline';
  }
  const t = rawType.toLowerCase().trim();
  if (['video_queue', 'youtube', 'video'].includes(t)) return 'youtube';
  if (t === 'podcast') return 'podcast';
  if (['article', 'bloomberg'].includes(t)) return 'article';
  if (['expert-pipeline', 'expert_pipeline'].includes(t)) return 'expert_pipeline';
  if (t === 'manual') return 'manual';
  // fallback
  return doc.youtube_id ? 'youtube' : 'expert_pipeline';
}

// ── Field mapping ──────────────────────────────────────────────────────────────
function computeNewFields(doc) {
  const fields = {};

  // sourceUrl
  fields.sourceUrl = doc.source_url
    || doc.video_url
    || doc.url
    || (doc.youtube_id ? `https://www.youtube.com/watch?v=${doc.youtube_id}` : null);

  // sourceId
  fields.sourceId = doc.youtube_id || doc.video_id || doc.videoId || null;

  // sourceTitle
  fields.sourceTitle = (doc.video_title || doc.title || doc.topic || '').trim() || null;

  // sourceName
  fields.sourceName = (doc.source_name || doc.channel || doc.institution || '').trim()
    || 'Unknown (Legacy)';

  // sourcePublishedAt
  fields.sourcePublishedAt = doc.publish_date || doc.date || doc.publishedAt || null;

  // fetchedAt
  fields.fetchedAt = doc.created_at || doc.createdAt
    ? (doc.created_at || doc.createdAt || doc.insertedAt || doc.syncedAt || null)
    : (doc.insertedAt || doc.syncedAt || null);
  // Normalize: if it's a Date object, convert to ISO string
  if (fields.fetchedAt instanceof Date) {
    fields.fetchedAt = fields.fetchedAt.toISOString();
  }

  // sourceType
  fields.sourceType = mapSourceType(doc.source_type || doc.sourceType, doc);

  // rawText
  fields.rawText = doc.transcript_sample
    || doc.transcript_preview
    || (Array.isArray(doc.key_points) ? JSON.stringify(doc.key_points) : null)
    || doc.article || doc.body || null;

  // rawTextType
  fields.rawTextType = fields.rawText
    ? (doc.youtube_id ? 'transcript' : 'sourceText')
    : null;

  return fields;
}

// ── Determine initial status ───────────────────────────────────────────────────
function determineStatus(doc, newFields) {
  const hasSourceUrl = !!newFields.sourceUrl;
  const hasRawText = newFields.rawText && newFields.rawText.length >= 3000;
  const hasV2 = doc.keyInsightsV2Status === 'completed';
  const hasDraft = doc.draftStatus === 'draft_ready';

  if (hasSourceUrl && hasRawText && hasV2 && hasDraft) return 'ready';
  if (hasSourceUrl && hasRawText) return 'queued';
  return 'needs_manual';
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  console.log('🔗 Connected to MongoDB');

  const db = client.db('13f-tracker');
  const collection = db.collection('expert_insights');

  const allDocs = await collection.find({}).toArray();
  const total = allDocs.length;

  console.log(`\n📊 Backfill Report`);
  console.log('═'.repeat(50));
  console.log(`Total documents:           ${total}`);

  // Stats
  let alreadyBackfilled = 0;
  let willProcess = 0;
  const statusCounts = { ready: 0, queued: 0, needs_manual: 0 };
  const fieldCoverage = {
    sourceUrl: 0, sourceId: 0, sourceTitle: 0,
    sourceName: 0, sourcePublishedAt: 0, rawText: 0,
  };
  const sourceNameFallback = { count: 0 };
  const needsManualBreakdown = {
    missingSourceUrl: 0,
    rawTextTooShort: 0,
    missingSourceTitle: 0,
    missingBoth: 0,
  };

  const updates = [];

  for (const doc of allDocs) {
    // Skip already backfilled
    if (doc._backfilled === true) {
      alreadyBackfilled++;
      continue;
    }

    willProcess++;
    const newFields = computeNewFields(doc);

    // Don't overwrite existing new-schema fields
    const $set = {};
    for (const [key, value] of Object.entries(newFields)) {
      if (doc[key] === undefined || doc[key] === null) {
        $set[key] = value;
      }
    }

    // Determine status (only set if not already set)
    const effectiveFields = { ...newFields };
    // Use existing values if already present
    for (const key of Object.keys(newFields)) {
      if (doc[key] !== undefined && doc[key] !== null) {
        effectiveFields[key] = doc[key];
      }
    }

    if (!doc.status || doc.status === 'new') {
      $set.status = determineStatus(doc, effectiveFields);
    }

    $set._backfilled = true;
    $set._backfilledAt = new Date();

    // Count stats using effective (final) fields
    const finalStatus = $set.status || doc.status;
    if (finalStatus === 'ready') statusCounts.ready++;
    else if (finalStatus === 'queued') statusCounts.queued++;
    else statusCounts.needs_manual++;

    if (effectiveFields.sourceUrl) fieldCoverage.sourceUrl++;
    if (effectiveFields.sourceId) fieldCoverage.sourceId++;
    if (effectiveFields.sourceTitle) fieldCoverage.sourceTitle++;
    if (effectiveFields.sourceName && effectiveFields.sourceName !== 'Unknown (Legacy)') {
      fieldCoverage.sourceName++;
    } else if (effectiveFields.sourceName === 'Unknown (Legacy)') {
      fieldCoverage.sourceName++;
      sourceNameFallback.count++;
    }
    if (effectiveFields.sourcePublishedAt) fieldCoverage.sourcePublishedAt++;
    if (effectiveFields.rawText) fieldCoverage.rawText++;

    // needs_manual breakdown
    if (finalStatus === 'needs_manual') {
      const noUrl = !effectiveFields.sourceUrl;
      const shortText = !effectiveFields.rawText || effectiveFields.rawText.length < 3000;
      if (noUrl && shortText) needsManualBreakdown.missingBoth++;
      else if (noUrl) needsManualBreakdown.missingSourceUrl++;
      else if (shortText) needsManualBreakdown.rawTextTooShort++;
    }

    updates.push({ filter: { _id: doc._id }, update: { $set } });
  }

  console.log(`Already backfilled:        ${alreadyBackfilled}`);
  console.log(`Will process:              ${willProcess}`);
  console.log('');
  console.log(`Results:`);
  console.log(`  → ready:                 ${statusCounts.ready}  (sourceUrl + rawText + V2 + draft)`);
  console.log(`  → queued:                ${statusCounts.queued}  (has sourceUrl + rawText, missing V2/draft)`);
  console.log(`  → needs_manual:          ${statusCounts.needs_manual}  (missing sourceUrl or rawText)`);
  console.log('');
  console.log(`Field coverage:`);
  console.log(`  sourceUrl filled:        ${fieldCoverage.sourceUrl}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.sourceUrl/willProcess*100) : 0}%)`);
  console.log(`  sourceId filled:         ${fieldCoverage.sourceId}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.sourceId/willProcess*100) : 0}%)`);
  console.log(`  sourceTitle filled:      ${fieldCoverage.sourceTitle}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.sourceTitle/willProcess*100) : 0}%)`);
  console.log(`  sourceName filled:       ${fieldCoverage.sourceName}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.sourceName/willProcess*100) : 0}%)${sourceNameFallback.count ? ` [${sourceNameFallback.count} used fallback]` : ''}`);
  console.log(`  sourcePublishedAt:       ${fieldCoverage.sourcePublishedAt}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.sourcePublishedAt/willProcess*100) : 0}%)`);
  console.log(`  rawText filled:          ${fieldCoverage.rawText}/${willProcess}  (${willProcess ? Math.round(fieldCoverage.rawText/willProcess*100) : 0}%)`);

  if (statusCounts.needs_manual > 0) {
    console.log('');
    console.log(`needs_manual breakdown:`);
    console.log(`  - missing sourceUrl:     ${needsManualBreakdown.missingSourceUrl}`);
    console.log(`  - rawText too short:     ${needsManualBreakdown.rawTextTooShort}`);
    console.log(`  - missing both:          ${needsManualBreakdown.missingBoth}`);
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY RUN — no changes written to database.`);
    console.log(`   Run with --execute to apply changes.`);
  } else {
    console.log(`\n✏️  Writing ${updates.length} updates to database...`);
    let written = 0;
    for (const { filter, update } of updates) {
      await collection.updateOne(filter, update);
      written++;
    }
    console.log(`✅ Done. ${written} documents updated.`);
  }

  await client.close();
}

main().catch(e => { console.error('💥 Fatal:', e); process.exit(1); });
