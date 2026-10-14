import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'demo-hina-ci';
const [firestoreRules, storageRules] = await Promise.all([
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
]);

let env;
const scorePath = (uid, id) => `artifacts/hina-test/users/${uid}/scores/${id}`;
const publicSummaryPath = (id) => `artifacts/hina-test/publicScoreSummaries/${id}`;
const copyPath = (id, uid) => `${publicSummaryPath(id)}/copies/${uid}`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

test('owner can create, read, update, and delete a score but cannot transfer ownership', async () => {
  const db = env.authenticatedContext('owner').firestore();
  const scoreRef = doc(db, scorePath('owner', 'owner-score'));
  await assertSucceeds(setDoc(scoreRef, {
    title: 'Owner score',
    content: '{}',
    ownerUid: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
  }));
  await assertSucceeds(getDoc(scoreRef));
  await assertFails(updateDoc(scoreRef, { ownerUid: 'attacker', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(scoreRef, { title: 'Updated', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(scoreRef));
});

test('unauthenticated users cannot read private scores; public summaries remain readable', async () => {
  const ownerDb = env.authenticatedContext('owner').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, scorePath('owner', 'private-score')), {
    title: 'Private',
    content: '{}',
    ownerUid: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isPublic: false,
  }));
  await assertSucceeds(setDoc(doc(ownerDb, publicSummaryPath('public-score')), {
    title: 'Public',
    contentLength: 2,
    ownerUid: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    copiedCount: 0,
    isPublic: true,
  }));

  const visitor = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(visitor, scorePath('owner', 'private-score'))));
  await assertSucceeds(getDoc(doc(visitor, publicSummaryPath('public-score'))));
  await assertFails(setDoc(doc(visitor, scorePath('visitor', 'new-score')), {
    title: 'Nope', content: '{}', ownerUid: 'visitor',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  const nonOwner = env.authenticatedContext('visitor').firestore();
  await assertFails(getDoc(doc(nonOwner, scorePath('owner', 'private-score'))));
  await assertSucceeds(getDoc(doc(nonOwner, publicSummaryPath('public-score'))));
});

test('public copiedCount increments once per user and duplicate ledger writes are denied', async () => {
  const ownerDb = env.authenticatedContext('owner').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, publicSummaryPath('popular-score')), {
    title: 'Popular',
    contentLength: 2,
    ownerUid: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    copiedCount: 0,
    isPublic: true,
  }));

  const visitorDb = env.authenticatedContext('visitor').firestore();
  const summaryRef = doc(visitorDb, publicSummaryPath('popular-score'));
  const ledgerRef = doc(visitorDb, copyPath('popular-score', 'visitor'));
  const firstCopy = writeBatch(visitorDb);
  firstCopy.update(summaryRef, { copiedCount: increment(1), updatedAt: serverTimestamp() });
  firstCopy.set(ledgerRef, { copiedAt: serverTimestamp() });
  await assertSucceeds(firstCopy.commit());

  const duplicateCopy = writeBatch(visitorDb);
  duplicateCopy.update(summaryRef, { copiedCount: increment(1), updatedAt: serverTimestamp() });
  duplicateCopy.set(ledgerRef, { copiedAt: serverTimestamp() });
  await assertFails(duplicateCopy.commit());

  const attackerUpdate = writeBatch(visitorDb);
  attackerUpdate.update(summaryRef, { copiedCount: increment(10), title: 'Tampered', updatedAt: serverTimestamp() });
  await assertFails(attackerUpdate.commit());
});

test('Storage score.json is readable by its owner only', async () => {
  const path = 'artifacts/hina-test/users/owner/scores/private-score/score.json';
  const bucketUrl = `gs://${projectId}.appspot.com`;
  const ownerStorage = env.authenticatedContext('owner').storage(bucketUrl);
  await assertSucceeds(uploadString(ref(ownerStorage, path), '{}', 'raw', { contentType: 'application/json' }));
  await assertSucceeds(getBytes(ref(ownerStorage, path)));

  const anotherUserStorage = env.authenticatedContext('visitor').storage(bucketUrl);
  const visitorStorage = env.unauthenticatedContext().storage(bucketUrl);
  await assertFails(getBytes(ref(anotherUserStorage, path)));
  await assertFails(getBytes(ref(visitorStorage, path)));
});
