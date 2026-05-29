const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

function naturalSortKey(value) {
  return String(value || '')
    .toLowerCase()
    .split(/(\d+)/u)
    .map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
}

export function naturalCompareByName(left, right) {
  const leftKey = naturalSortKey(left?.name ?? left);
  const rightKey = naturalSortKey(right?.name ?? right);
  const maxLength = Math.max(leftKey.length, rightKey.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftKey[index];
    const rightPart = rightKey[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart - rightPart;
    }
    return String(leftPart).localeCompare(String(rightPart));
  }

  return 0;
}

function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  let eocdOffset = -1;

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('找不到 MXL 壓縮檔目錄，檔案可能不是有效的 .mxl。');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let directoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(directoryOffset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error('MXL 壓縮檔目錄格式不正確。');
    }

    const compressionMethod = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const uncompressedSize = view.getUint32(directoryOffset + 24, true);
    const fileNameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const localHeaderOffset = view.getUint32(directoryOffset + 42, true);
    const fileNameBytes = new Uint8Array(arrayBuffer, directoryOffset + 46, fileNameLength);
    const name = decoder.decode(fileNameBytes);

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('此瀏覽器不支援直接解壓縮 .mxl，請改匯入 .musicxml / .xml。');
  }

  const formats = ['deflate-raw', 'deflate'];
  let lastError = null;

  for (const format of formats) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`MXL 解壓縮失敗：${lastError?.message || '不支援此壓縮資料'}`);
}

async function readZipEntry(arrayBuffer, entry) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(entry.localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER) {
    throw new Error(`MXL 內部檔案 ${entry.name} 的標頭格式不正確。`);
  }

  const fileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedBytes = new Uint8Array(arrayBuffer, dataOffset, entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedBytes;
  }

  if (entry.compressionMethod === 8) {
    return inflateRaw(compressedBytes);
  }

  throw new Error(`不支援的 MXL 壓縮方式：${entry.compressionMethod}`);
}

function readContainerRootPath(containerXml) {
  const document = new DOMParser().parseFromString(String(containerXml ?? '').replace(/^\uFEFF/u, ''), 'application/xml');
  const rootFile = Array.from(document.getElementsByTagName('*'))
    .find((element) => element.localName === 'rootfile' && element.hasAttribute('full-path'));
  return rootFile?.getAttribute('full-path') || '';
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/u, '');
}

export async function readMusicXmlFile(file) {
  const name = file?.name?.toLowerCase() || '';

  if (name.endsWith('.musicxml') || name.endsWith('.xml')) {
    return {
      xmlText: String(await file.text()).replace(/^\uFEFF/u, ''),
      extractedFileName: file.name,
      sourceType: 'MusicXML',
    };
  }

  if (!name.endsWith('.mxl')) {
    throw new Error('只支援 .musicxml、.xml、.mxl 檔案。');
  }

  const arrayBuffer = await file.arrayBuffer();
  const entries = readZipEntries(arrayBuffer).filter((entry) => !entry.name.endsWith('/'));
  const containerEntry = entries.find((entry) => entry.name.toLowerCase() === 'meta-inf/container.xml');
  let musicXmlEntry = null;

  if (containerEntry) {
    const containerXml = decodeUtf8(await readZipEntry(arrayBuffer, containerEntry));
    const rootPath = readContainerRootPath(containerXml);
    musicXmlEntry = entries.find((entry) => entry.name === rootPath);
  }

  musicXmlEntry ||= entries.find((entry) => /\.(musicxml|xml)$/iu.test(entry.name) && !entry.name.toLowerCase().startsWith('meta-inf/'));

  if (!musicXmlEntry) {
    throw new Error('MXL 內找不到 MusicXML 主譜檔。');
  }

  return {
    xmlText: decodeUtf8(await readZipEntry(arrayBuffer, musicXmlEntry)),
    extractedFileName: musicXmlEntry.name.split('/').pop() || file.name.replace(/\.mxl$/iu, '.musicxml'),
    sourceType: 'MXL',
  };
}
