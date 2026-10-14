import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [firestore, storage, service, pkg] = await Promise.all([
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/firebase.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('Firestore rules use the application owner/public fields and require authentication', () => {
  assert.match(firestore, /function signedIn\(\)\s*\{\s*return request\.auth != null;/);
  assert.match(firestore, /ownerUid/);
  assert.match(firestore, /resource\.data\.isPublic == true/);
  assert.match(firestore, /match \/artifacts\/\{appId\}\/users\/\{uid\}\/scores/);
  assert.match(service, /ownerUid: uid/);
  assert.match(service, /isPublic: true/);
});

test('creates bind ownership, timestamp, payload shape, and initial public copy count', () => {
  assert.match(firestore, /request\.resource\.data\.ownerUid == uid/);
  assert.match(firestore, /request\.resource\.data\.createdAt == request\.time/);
  assert.match(firestore, /request\.resource\.data\.get\('copiedCount', 0\) == 0/);
  assert.match(firestore, /function validScore\(\)/);
  assert.match(firestore, /function validSummary\(\)/);
});

test('owner updates preserve ownerUid and createdAt, and deletes are owner-only', () => {
  assert.match(firestore, /function immutableOwnerFields\(\)/);
  assert.match(firestore, /request\.resource\.data\.ownerUid == resource\.data\.ownerUid/);
  assert.match(firestore, /request\.resource\.data\.get\('createdAt', null\) == resource\.data\.get\('createdAt', null\)/);
  assert.match(firestore, /allow read, delete: if owner\(uid\)/);
  assert.match(firestore, /allow delete: if signedIn\(\) && resource\.data\.ownerUid == request\.auth\.uid/);
});

test('public copy counter accepts exactly one increment with a unique per-user ledger', () => {
  assert.match(firestore, /affectedKeys\(\)\.hasOnly\(\['copiedCount', 'updatedAt'\]\)/);
  assert.match(firestore, /request\.resource\.data\.copiedCount == resource\.data\.get\('copiedCount', 0\) \+ 1/);
  assert.match(firestore, /request\.resource\.data\.updatedAt == request\.time/);
  assert.match(firestore, /!exists\(copyLedgerPath\(appId, scoreId, request\.auth\.uid\)\)/);
  assert.match(firestore, /existsAfter\(copyLedgerPath\(appId, scoreId, request\.auth\.uid\)\)/);
  assert.match(firestore, /match \/copies\/\{uid\}/);
  assert.match(firestore, /allow update, delete: if false/);
  assert.match(service, /batch\.set\(copyRecordRef/);
  assert.match(service, /batch\.update\(publicScoreSummaryDoc/);
  assert.match(service, /copiedAt: ctx\.serverTimestamp\(\)/);
});

test('Storage writes are owner-scoped, JSON-only, and size-limited', () => {
  assert.match(storage, /allow read: if isOwner\(userId\)/);
  assert.match(storage, /allow create, update: if isOwner\(userId\)/);
  assert.match(storage, /fileName == 'score\.json'/);
  assert.match(storage, /request\.resource\.contentType\.matches\('application\/json\(; charset=utf-8\)\?'\)/);
  assert.match(storage, /request\.resource\.size <= 20 \* 1024 \* 1024/);
  // Public score JSON is consumed through the download URL persisted in its public summary.
  assert.match(service, /downloadUrl: await ctx\.getDownloadURL\(ref\)/);
  assert.match(service, /record\?\.contentStorage\?\.downloadUrl/);
  assert.match(service, /fetch\(downloadUrl\)/);
});

test('midi-file is declared as a production dependency', () => {
  assert.equal(typeof pkg.dependencies['midi-file'], 'string');
});
