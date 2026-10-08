import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { normalizeScoreSource } from '../src/utils/score.js';
import { readFile } from 'node:fs/promises';

const appId = process.env.VITE_APP_ID || 'universe-rhythm-recorder';
const projectConfig = JSON.parse(await readFile(new URL('../.firebaserc', import.meta.url), 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || projectConfig.projects?.default;
const expectedProjectId = 'guilty-corn';
const apply = process.argv.includes('--apply');
const reportPath = process.argv.find((arg) => arg.startsWith('--report='))?.slice('--report='.length)
  || 'firebase-score-migration-report.json';
const suffix = '__slim32';

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value.replace(/^\uFEFF/u, '')); } catch { return null; }
}

function getPayload(record) {
  const raw = parseJson(record.rawText ?? record.content);
  if (!raw) return null;
  if (raw.storageFormat === 'hina-cloud-score-pointer@1') return null;
  return raw;
}

function classify(payload, record) {
  const version = String(payload?.version ?? payload?.meta?.version ?? record.version ?? '').toLowerCase();
  if (version === '2.0' || version === '2' || version.startsWith('v2')) return 'v2';
  if (version === '3.0' || version === '3' || version.startsWith('v3')) return 'v3';
  if (version === '3.2-ultra-slim') return 'slim';
  if (!version && Array.isArray(payload?.tracks)) return 'legacy-json';
  if (!version && Array.isArray(payload?.events)) return 'legacy-json';
  return 'unknown';
}

function sourceFormatFor(payload, kind) {
  const origin = String(payload?.meta?.sourceFormat ?? payload?.meta?.originalFormat ?? payload?.meta?.sourceType ?? '').toLowerCase();
  if (['midi', 'musicxml', 'mxl'].includes(origin)) return origin;
  return kind === 'legacy-json' ? 'legacy-json' : kind;
}

function midiFromEvent(event) {
  const midi = event.midi === null || event.midi === undefined ? NaN : Number(event.midi);
  if (Number.isFinite(midi)) return Math.max(0, Math.min(127, Math.round(midi)));
  const frequency = Number(event.frequency);
  if (Number.isFinite(frequency) && frequency > 0) {
    return Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(frequency / 440))));
  }
  return null;
}

function makeSlim(payload, record, kind) {
  const normalized = normalizeScoreSource(payload);
  const events = normalized.events.filter((event) => !event.isRest);
  if (!events.length) throw new Error('No playable note events were produced.');
  if (events.some((event) => midiFromEvent(event) === null)) {
    throw new Error('Some events have no MIDI pitch and cannot be represented in Slim 3.2.');
  }

  const trackIds = [...new Set(events.map((event) => String(event.trackId ?? '0')))];
  const trackIndex = new Map(trackIds.map((id, index) => [id, index]));
  const sourceTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  const tracks = trackIds.map((id, index) => {
    const sourceTrack = sourceTracks.find((track, trackIndexValue) => {
      const candidate = Array.isArray(track) ? String(trackIndexValue) : String(track?.id ?? trackIndexValue);
      return candidate === id;
    });
    if (Array.isArray(sourceTrack)) {
      return [sourceTrack[0] ?? 'Track ' + (index + 1), Number(sourceTrack[1]) || 0, sourceTrack[2] ?? 'unknown', sourceTrack[3] ?? null, sourceTrack[4] ?? null];
    }
    return [
      sourceTrack?.name ?? sourceTrack?.id ?? 'Track ' + (index + 1),
      Number(sourceTrack?.channel ?? events.find((event) => String(event.trackId ?? '0') === id)?.channel) || 0,
      sourceTrack?.instrument ?? events.find((event) => String(event.trackId ?? '0') === id)?.midiInstrument ?? 'unknown',
      sourceTrack?.programNumber ?? events.find((event) => String(event.trackId ?? '0') === id)?.midiProgramNumber ?? null,
      sourceTrack?.instrumentFamily ?? null,
    ];
  });

  const notes = events.map((event) => [
    Math.max(0, Math.round(Number(event.tick ?? event.startTick) || 0)),
    Math.max(1, Math.round(Number(event.durationTicks ?? event.durationTick) || 1)),
    midiFromEvent(event),
    Number(Math.min(1, Math.max(0, Number(event.v ?? event.velocity) || 0)).toFixed(4)),
    trackIndex.get(String(event.trackId ?? '0')) ?? 0,
  ]).sort((a, b) => a[0] - b[0] || a[4] - b[4] || a[2] - b[2]);

  const playback = normalized.playback ?? {};
  const tempoMap = Array.isArray(playback.tempoMap) && playback.tempoMap.length
    ? playback.tempoMap.map((entry) => [
      Math.max(0, Math.round(Number(entry.startTick ?? entry.tick) || 0)),
      Number(entry.bpm) || Number(playback.bpm) || 120,
    ])
    : [[0, Number(playback.bpm) || Number(payload.transport?.bpm) || 120]];
  const sourceFormat = sourceFormatFor(payload, kind);

  return {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id: record.id,
      title: record.title ?? payload.meta?.title ?? record.id,
      displayTitle: payload.meta?.displayTitle ?? record.title ?? payload.meta?.title ?? record.id,
      sourceType: sourceFormat,
      sourceFormat,
      originalFormat: payload.meta?.originalFormat ?? sourceFormat,
      storageFormat: 'hina-slim-score@3.2',
      migratedAt: new Date().toISOString(),
      migrationSourceVersion: payload.version ?? payload.meta?.version ?? 'unversioned',
      migrationGlobalKeyOffset: Number(playback.globalKeyOffset ?? payload.playback?.globalKeyOffset) || 0,
    },
    transport: {
      bpm: Number(playback.bpm) || Number(payload.transport?.bpm) || 120,
      timeSigNum: Number(playback.timeSigNum) || Number(payload.transport?.timeSigNum) || 4,
      timeSigDen: Number(playback.timeSigDen) || Number(payload.transport?.timeSigDen) || 4,
      resolution: Math.max(1, Math.round(Number(playback.resolution) || Number(payload.transport?.resolution) || 480)),
    },
    playback: {
      tone: playback.tone ?? payload.playback?.tone ?? 'piano',
      globalKeyOffset: 0,
      scaleMode: playback.scaleMode ?? payload.playback?.scaleMode ?? 'major',
      reverb: playback.reverb ?? payload.playback?.reverb ?? true,
      accidentals: payload.playback?.accidentals ?? {},
      tempoMap,
    },
    source: { migratedFrom: record.path },
    tracks,
    notes,
  };
}

async function loadRecordPayload(record, bucket) {
  const direct = getPayload(record.data);
  if (direct) return direct;
  const pointer = parseJson(record.data.rawText ?? record.data.content);
  const storagePath = record.data.contentStorage?.path ?? pointer?.contentStorage?.path;
  if (!storagePath) return null;
  if (!bucket) throw new Error('Storage pointer found; set FIREBASE_STORAGE_BUCKET to read the preserved payload.');
  const [buffer] = await bucket.file(storagePath).download();
  return parseJson(buffer.toString('utf8'));
}

async function collectDocuments(db) {
  const [privateSnapshot, publicSnapshot] = await Promise.all([
    db.collectionGroup('scores').get(),
    db.collection('artifacts').doc(appId).collection('publicScores').get(),
  ]);
  const privatePrefix = 'artifacts/' + appId + '/users/';
  return [
    ...privateSnapshot.docs.filter((snap) => snap.ref.path.startsWith(privatePrefix)).map((snap) => ({ ref: snap.ref, path: snap.ref.path, id: snap.id, data: snap.data(), visibility: 'private' })),
    ...publicSnapshot.docs.map((snap) => ({ ref: snap.ref, path: snap.ref.path, id: snap.id, data: snap.data(), visibility: 'public' })),
  ];
}

async function writeMigratedRecord(db, record, slim) {
  const targetId = record.id.endsWith(suffix) ? record.id : record.id + suffix;
  slim.meta.id = targetId;
  const targetRef = record.ref.parent.doc(targetId);
  const existing = await targetRef.get();
  if (existing.exists) return 'already-exists';

  const rawText = JSON.stringify(slim);
  const sourceFormat = slim.meta.sourceFormat;
  const migrated = {
    ...record.data,
    id: targetId,
    title: slim.meta.title,
    rawText,
    content: rawText,
    version: slim.version,
    sourceFormat,
    storageFormat: slim.meta.storageFormat,
    migrationStatus: 'pending',
    migratedAt: FieldValue.serverTimestamp(),
    migrationSource: { path: record.path, documentId: record.id },
    compilerVersion: record.data.compilerVersion ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  delete migrated.contentStorage;
  await targetRef.create(migrated);

  const parentSegments = record.ref.parent.path.split('/');
  const isUserScore = parentSegments[2] === 'users';
  const summaryCollectionName = record.visibility === 'public' ? 'publicScoreSummaries' : 'scoreSummaries';
  const summaryParent = record.visibility === 'public'
    ? db.collection('artifacts').doc(appId)
    : db.collection('artifacts').doc(appId).collection('users').doc(parentSegments.at(-2));
  const summaryRef = summaryParent.collection(summaryCollectionName).doc(targetId);
  const oldSummaryRef = summaryParent.collection(summaryCollectionName).doc(record.id);
  const oldSummary = await oldSummaryRef.get();
  await summaryRef.set({
    ...(oldSummary.exists ? oldSummary.data() : {}),
    id: targetId,
    title: slim.meta.title,
    sourceFormat,
    storageFormat: slim.meta.storageFormat,
    version: slim.version,
    migrationStatus: 'pending',
    migratedAt: FieldValue.serverTimestamp(),
    contentLength: rawText.length,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return isUserScore ? 'created-private-copy' : 'created-public-copy';
}

async function main() {
  if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID (and ADC credentials) before running this command.');
  if (projectId !== expectedProjectId) throw new Error('Refusing to inspect a Firebase project other than guilty-corn.');
  const app = initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore(app);
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
  const bucket = bucketName ? getStorage(app).bucket(bucketName) : null;
  const documents = await collectDocuments(db);
  const report = {
    projectId,
    appId,
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'inventory-only',
    totals: { scanned: documents.length, currentSlim: 0, v2: 0, v3: 0, legacyJson: 0, unknown: 0, autoConvertible: 0, needsManualReview: 0 },
    records: [],
  };

  for (const record of documents) {
    let payload;
    try { payload = await loadRecordPayload(record, bucket); } catch (error) {
      report.records.push({ path: record.path, id: record.id, visibility: record.visibility, category: 'needs-review', reason: 'storage-read-failed: ' + error.message });
      report.totals.needsManualReview += 1;
      continue;
    }
    const kind = classify(payload, record.data);
    if (kind === 'slim') {
      report.totals.currentSlim += 1;
      continue;
    }
    if (kind === 'v2') report.totals.v2 += 1;
    else if (kind === 'v3') report.totals.v3 += 1;
    else if (kind === 'legacy-json') report.totals.legacyJson += 1;
    else report.totals.unknown += 1;

    if (!payload || kind === 'unknown') {
      report.records.push({ path: record.path, id: record.id, visibility: record.visibility, category: kind, status: 'needs-manual-review', reason: payload ? 'unsupported-json-shape' : 'missing-or-unreadable-payload' });
      report.totals.needsManualReview += 1;
      continue;
    }

    try {
      const slim = makeSlim(payload, { ...record.data, id: record.id, path: record.path }, kind);
      report.totals.autoConvertible += 1;
      let migration = 'dry-run';
      if (apply) migration = await writeMigratedRecord(db, record, slim);
      report.records.push({ path: record.path, id: record.id, visibility: record.visibility, category: kind, status: migration, targetId: record.id + suffix, sourceFormat: slim.meta.sourceFormat, noteCount: slim.notes.length, trackCount: slim.tracks.length });
    } catch (error) {
      report.records.push({ path: record.path, id: record.id, visibility: record.visibility, category: kind, status: 'needs-manual-review', reason: error.message });
      report.totals.needsManualReview += 1;
    }
  }

  await (await import('node:fs/promises')).writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report.totals, null, 2));
  console.log('Report: ' + reportPath);
  if (!apply) console.log('No Firebase documents were changed. Pass --apply to create separate migration copies.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
