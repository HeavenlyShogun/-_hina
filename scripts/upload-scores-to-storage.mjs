import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scoreDirectory = path.join(projectRoot, '風物之琴譜', '風物之譜面', 'slim-json');
const destinationRoot = 'score-library/slim-json';
const dryRun = process.argv.includes('--dry-run');
const expectedProjectId = 'guilty-corn';

async function collectScores() {
  const filenames = (await fs.readdir(scoreDirectory))
    .filter((filename) => filename.endsWith('-slim.json'))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (filenames.length === 0) {
    throw new Error(`No slim JSON files found in ${scoreDirectory}`);
  }

  return Promise.all(filenames.map(async (filename) => {
    const sourcePath = path.join(scoreDirectory, filename);
    const content = await fs.readFile(sourcePath, 'utf8');
    const score = JSON.parse(content.replace(/^\uFEFF/u, ''));
    const version = score.version ?? score.meta?.version;

    if (version !== '3.2-ultra-slim') {
      throw new Error(`${filename} has unsupported slim format: ${version ?? 'missing version'}`);
    }

    return { filename, sourcePath, size: Buffer.byteLength(content) };
  }));
}

async function uploadScores(scores) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId !== expectedProjectId) {
    throw new Error(`Set FIREBASE_PROJECT_ID to the production Firebase project (${expectedProjectId}).`);
  }

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('Set FIREBASE_STORAGE_BUCKET to the Firebase Storage bucket name.');
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath && !(await fs.stat(credentialsPath).catch(() => null))?.isFile()) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a readable service account JSON file.');
  }

  const [{ applicationDefault, initializeApp }, { getStorage }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/storage'),
  ]);
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: bucketName,
  });
  const bucket = getStorage(app).bucket();
  const [metadata] = await bucket.getMetadata();
  if (metadata.name !== bucketName) {
    throw new Error(`Resolved Storage bucket ${metadata.name} does not match configured bucket ${bucketName}.`);
  }
  console.log(`Uploading to Firebase project ${projectId}, bucket ${bucketName}.`);
  const concurrency = 4;

  for (let offset = 0; offset < scores.length; offset += concurrency) {
    const batch = scores.slice(offset, offset + concurrency);
    await Promise.all(batch.map(({ filename, sourcePath }) => bucket.upload(sourcePath, {
      destination: `${destinationRoot}/${filename}`,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public,max-age=3600',
      },
    })));
    console.log(`Uploaded ${Math.min(offset + batch.length, scores.length)}/${scores.length}`);
  }
}

try {
  const scores = await collectScores();
  const totalBytes = scores.reduce((total, score) => total + score.size, 0);
  console.log(`Validated ${scores.length} slim scores (${totalBytes} bytes).`);

  if (dryRun) {
    console.log('Dry run complete; no Firebase objects were changed.');
  } else {
    await uploadScores(scores);
  }
} catch (error) {
  console.error(`Score upload failed: ${error.message}`);
  process.exitCode = 1;
}
