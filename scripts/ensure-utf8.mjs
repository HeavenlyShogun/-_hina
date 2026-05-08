import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ROOTS = ['src', '風物之琴譜'];
const TARGET_EXTENSIONS = new Set(['.txt', '.js', '.jsx']);
const FALLBACK_ENCODINGS = ['big5', 'gb18030', 'shift_jis', 'utf-16le'];
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const shouldFailOnWarnings = args.has('--strict');

function parseRoots() {
  const rootArg = process.argv.find((arg) => arg.startsWith('--roots='));
  if (!rootArg) {
    return DEFAULT_ROOTS;
  }

  return rootArg
    .slice('--roots='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasUtf8Bom(buffer) {
  return buffer.length >= UTF8_BOM.length && buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
}

function decodeWithEncoding(buffer, encoding) {
  const decoder = new TextDecoder(encoding, { fatal: true });
  return decoder.decode(buffer);
}

function decodeUtf8(buffer) {
  return decodeWithEncoding(buffer, 'utf-8');
}

function stripBomText(text) {
  return String(text ?? '').replace(/^\uFEFF/u, '');
}

function encodeUtf8NoBom(text) {
  return Buffer.from(stripBomText(text), 'utf8');
}

function scoreDecodedText(text) {
  const value = String(text ?? '');
  if (!value) {
    return 0;
  }

  let printable = 0;
  let cjk = 0;
  let controls = 0;
  let replacements = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (char === '\uFFFD') replacements += 1;
    if (char === '\n' || char === '\r' || char === '\t' || codePoint >= 0x20) printable += 1;
    if (codePoint < 0x20 && char !== '\n' && char !== '\r' && char !== '\t') controls += 1;
    if (
      (codePoint >= 0x3400 && codePoint <= 0x9fff)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    ) {
      cjk += 1;
    }
  }

  return printable + (cjk * 0.35) - (controls * 8) - (replacements * 20);
}

function chooseFallbackDecode(buffer) {
  const candidates = [];

  for (const encoding of FALLBACK_ENCODINGS) {
    try {
      const text = decodeWithEncoding(buffer, encoding);
      candidates.push({
        encoding,
        text,
        score: scoreDecodedText(text),
      });
    } catch {}
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function looksSuspicious(text) {
  const value = String(text ?? '');
  const rareMojibakeChars = value.match(/[嚗蝡銋撌憸閮瘚蝯摰餃銝]/gu) ?? [];
  const replacementChars = value.match(/\uFFFD/gu) ?? [];
  return replacementChars.length > 0 || rareMojibakeChars.length >= 12;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (entry.isFile() && TARGET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function inspectFile(filePath) {
  const buffer = await readFile(filePath);
  const hadBom = hasUtf8Bom(buffer);
  const body = hadBom ? buffer.subarray(UTF8_BOM.length) : buffer;

  try {
    const text = decodeUtf8(body);
    const normalized = encodeUtf8NoBom(text);
    const needsWrite = hadBom || !body.equals(normalized);
    if (needsWrite && shouldWrite) {
      await writeFile(filePath, normalized);
    }

    return {
      filePath,
      status: needsWrite ? (shouldWrite ? 'normalized' : 'needs-normalize') : 'ok',
      encoding: 'utf-8',
      warning: looksSuspicious(text) ? 'suspicious-mojibake' : null,
    };
  } catch {
    const fallback = chooseFallbackDecode(buffer);

    if (!fallback) {
      return {
        filePath,
        status: 'error',
        encoding: 'unknown',
        warning: 'invalid-utf8-no-fallback',
      };
    }

    const normalized = encodeUtf8NoBom(fallback.text);
    if (shouldWrite) {
      await writeFile(filePath, normalized);
    }

    return {
      filePath,
      status: shouldWrite ? 'converted' : 'needs-convert',
      encoding: fallback.encoding,
      warning: looksSuspicious(fallback.text) ? 'suspicious-mojibake-after-decode' : null,
    };
  }
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, '/');
}

async function main() {
  const roots = parseRoots();
  const rootPaths = roots.map((root) => path.resolve(process.cwd(), root));
  const files = (await Promise.all(rootPaths.map(walk))).flat().sort();
  const results = [];

  for (const filePath of files) {
    results.push(await inspectFile(filePath));
  }

  const actionable = results.filter((item) => item.status !== 'ok');
  const warnings = results.filter((item) => item.warning);
  const errors = results.filter((item) => item.status === 'error');

  console.log(JSON.stringify({
    mode: shouldWrite ? 'write' : 'check',
    roots,
    files: results.length,
    ok: results.length - actionable.length,
    actionable: actionable.length,
    warnings: warnings.length,
    errors: errors.length,
  }, null, 2));

  if (actionable.length > 0) {
    console.table(actionable.map((item) => ({
      file: relativePath(item.filePath),
      status: item.status,
      detected: item.encoding,
      warning: item.warning ?? '',
    })));
  }

  if (warnings.length > 0) {
    console.log('Suspicious text markers found. These files are valid UTF-8 bytes, but may already contain mojibake:');
    console.table(warnings.map((item) => ({
      file: relativePath(item.filePath),
      warning: item.warning,
    })));
  }

  if (errors.length > 0 || (shouldFailOnWarnings && warnings.length > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
