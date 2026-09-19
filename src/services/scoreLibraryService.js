const MANIFEST_URL = '/score-library-manifest.json';
const SCORE_CACHE_NAME = 'universe-score-cache';
const SCORE_CACHE_SCHEMA_VERSION = 'universe-score-cache@1';
const DEFAULT_FETCH_TIMEOUT_MS = 8000;

let manifestCache = null;
let manifestPromise = null;

/**
 * Creates an AbortSignal that cancels a fetch after the given timeout.
 *
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {{ signal: AbortSignal, clear: () => void }}
 */
function createTimeoutSignal(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

/**
 * Fetches JSON with a timeout and normalized error messages.
 *
 * @param {string} url - URL to request.
 * @param {object} [options] - Fetch options.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds.
 * @returns {Promise<object>} Parsed JSON response.
 */
async function fetchJson(url, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }

    throw new Error(`Failed to fetch JSON from ${url}: ${error?.message ?? String(error)}`);
  } finally {
    timeout.clear();
  }
}

/**
 * Returns whether the browser supports CacheStorage in the current context.
 *
 * @returns {boolean}
 */
function canUseCacheStorage() {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined';
}

/**
 * Builds the internal CacheStorage request key for a score slug.
 *
 * @param {string} slug - Score slug from the library manifest.
 * @returns {string}
 */
function createScoreCacheKey(slug) {
  return `/__universe-score-cache__/scores/${encodeURIComponent(String(slug || 'score'))}.json`;
}

/**
 * Creates a compact cache identity from the current manifest item.
 *
 * @param {object} manifestItem - Score metadata from score-library-manifest.json.
 * @returns {object}
 */
function createCacheIdentity(manifestItem = {}) {
  return {
    schemaVersion: SCORE_CACHE_SCHEMA_VERSION,
    slug: manifestItem.slug ?? null,
    filename: manifestItem.filename ?? null,
    storageFormat: manifestItem.storageFormat ?? null,
    storagePath: manifestItem.storagePath ?? null,
    localPath: manifestItem.localPath ?? null,
    bytes: Number.isFinite(Number(manifestItem.bytes)) ? Number(manifestItem.bytes) : null,
    noteCount: Number.isFinite(Number(manifestItem.noteCount)) ? Number(manifestItem.noteCount) : null,
    durationTicks: Number.isFinite(Number(manifestItem.durationTicks)) ? Number(manifestItem.durationTicks) : null,
  };
}

/**
 * Checks whether a cached payload still matches the current manifest metadata.
 *
 * @param {object} cachedIdentity - Identity saved with the cached score.
 * @param {object} nextIdentity - Identity derived from the current manifest item.
 * @returns {boolean}
 */
function isCacheIdentityMatch(cachedIdentity = {}, nextIdentity = {}) {
  return cachedIdentity.schemaVersion === nextIdentity.schemaVersion
    && cachedIdentity.slug === nextIdentity.slug
    && cachedIdentity.filename === nextIdentity.filename
    && cachedIdentity.storageFormat === nextIdentity.storageFormat
    && cachedIdentity.storagePath === nextIdentity.storagePath
    && cachedIdentity.localPath === nextIdentity.localPath
    && cachedIdentity.bytes === nextIdentity.bytes
    && cachedIdentity.noteCount === nextIdentity.noteCount
    && cachedIdentity.durationTicks === nextIdentity.durationTicks;
}

/**
 * Reads a score from CacheStorage if it exists and matches the manifest item.
 *
 * @param {string} slug - Score slug.
 * @param {object} manifestItem - Score metadata from the manifest.
 * @returns {Promise<object|null>} Cached score JSON, or null when missing/stale.
 */
async function readCachedScore(slug, manifestItem) {
  if (!canUseCacheStorage()) {
    return null;
  }

  try {
    const cache = await window.caches.open(SCORE_CACHE_NAME);
    const response = await cache.match(createScoreCacheKey(slug));

    if (!response) {
      return null;
    }

    const envelope = await response.json();
    const nextIdentity = createCacheIdentity(manifestItem);

    if (!isCacheIdentityMatch(envelope?.identity, nextIdentity)) {
      await cache.delete(createScoreCacheKey(slug));
      return null;
    }

    return envelope.score ?? null;
  } catch (error) {
    console.warn(`Failed to read cached score "${slug}".`, error);
    return null;
  }
}

/**
 * Writes a score payload to CacheStorage.
 *
 * @param {string} slug - Score slug.
 * @param {object} manifestItem - Score metadata from the manifest.
 * @param {object} score - Parsed slim score JSON.
 * @returns {Promise<void>}
 */
async function writeCachedScore(slug, manifestItem, score) {
  if (!canUseCacheStorage()) {
    return;
  }

  try {
    const cache = await window.caches.open(SCORE_CACHE_NAME);
    const envelope = {
      identity: createCacheIdentity(manifestItem),
      cachedAt: new Date().toISOString(),
      score,
    };

    await cache.put(
      createScoreCacheKey(slug),
      new Response(JSON.stringify(envelope), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
    );
  } catch (error) {
    console.warn(`Failed to write cached score "${slug}".`, error);
  }
}

/**
 * Resolves the URL used to download the slim score payload.
 *
 * @param {object} manifestItem - Score metadata from the manifest.
 * @returns {string}
 */
function resolveScoreUrl(manifestItem = {}) {
  const url = manifestItem.localPath ?? manifestItem.downloadUrl;

  if (!url) {
    throw new Error(`Manifest item "${manifestItem.slug ?? 'unknown'}" does not include a localPath.`);
  }

  return url;
}

/**
 * Loads and memoizes the global score library manifest.
 *
 * @returns {Promise<object>} Full score-library-manifest.json payload.
 */
export async function loadLibraryManifest() {
  if (manifestCache) {
    return manifestCache;
  }

  if (manifestPromise) {
    return manifestPromise;
  }

  manifestPromise = fetchJson(MANIFEST_URL)
    .then((manifest) => {
      manifestCache = manifest;
      return manifest;
    })
    .catch((error) => {
      manifestPromise = null;
      throw new Error(`Unable to load score library manifest: ${error?.message ?? String(error)}`);
    });

  return manifestPromise;
}

/**
 * Loads a slim score by slug using CacheStorage first, then the manifest localPath.
 *
 * @param {string} slug - Score slug to load.
 * @param {object} manifestItem - Matching score metadata from the manifest.
 * @returns {Promise<object>} Parsed slim score JSON.
 */
export async function fetchScoreBySlug(slug, manifestItem) {
  const normalizedSlug = String(slug || manifestItem?.slug || '').trim();

  if (!normalizedSlug) {
    throw new Error('fetchScoreBySlug requires a slug.');
  }

  if (!manifestItem || typeof manifestItem !== 'object') {
    throw new Error(`fetchScoreBySlug requires a manifest item for "${normalizedSlug}".`);
  }

  try {
    const cachedScore = await readCachedScore(normalizedSlug, manifestItem);
    if (cachedScore) {
      return cachedScore;
    }

    const scoreUrl = resolveScoreUrl(manifestItem);
    const score = await fetchJson(scoreUrl, { timeoutMs: DEFAULT_FETCH_TIMEOUT_MS });

    await writeCachedScore(normalizedSlug, manifestItem, score);
    return score;
  } catch (error) {
    throw new Error(`Unable to load score "${normalizedSlug}": ${error?.message ?? String(error)}`);
  }
}

/**
 * Clears all locally cached score payloads.
 *
 * @returns {Promise<boolean>} True when the CacheStorage namespace was deleted.
 */
export async function clearScoreCache() {
  if (!canUseCacheStorage()) {
    return false;
  }

  try {
    return await window.caches.delete(SCORE_CACHE_NAME);
  } catch (error) {
    throw new Error(`Unable to clear score cache: ${error?.message ?? String(error)}`);
  }
}

export const scoreLibraryService = {
  loadLibraryManifest,
  fetchScoreBySlug,
  clearScoreCache,
};

export default scoreLibraryService;
