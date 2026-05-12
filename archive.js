import { gunzipSync, strFromU8, unzipSync } from "fflate";

const textDecoder = new TextDecoder();

export function detectArchiveType(fileName = "") {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tgz";
  if (lower.endsWith(".tar")) return "tar";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".json")) return "json";
  return "unknown";
}

export function readArchiveEntries(fileName, bytes) {
  const archiveType = detectArchiveType(fileName);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  switch (archiveType) {
    case "json":
      return [
        {
          path: fileName,
          bytes: data,
          text: textDecoder.decode(data),
        },
      ];
    case "zip":
      return Object.entries(unzipSync(data)).map(([path, entryBytes]) => ({
        path,
        bytes: entryBytes,
        text: safeDecode(entryBytes),
      }));
    case "tgz":
      return parseTarEntries(gunzipSync(data));
    case "tar":
      return parseTarEntries(data);
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: ${fileName}`);
  }
}

function parseTarEntries(bytes) {
  const entries = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const sizeOctal = readTarString(header, 124, 12).replace(/\0/g, "").trim();
    const size = sizeOctal ? Number.parseInt(sizeOctal, 8) : 0;
    const fullPath = prefix ? `${prefix}/${name}` : name;
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    const body = bytes.slice(bodyStart, bodyEnd);

    entries.push({
      path: fullPath,
      bytes: body,
      text: safeDecode(body),
    });

    offset = bodyStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function readTarString(buffer, start, length) {
  return strFromU8(buffer.subarray(start, start + length))
    .replace(/\0+$/g, "")
    .trim();
}

function safeDecode(bytes) {
  try {
    return textDecoder.decode(bytes);
  } catch {
    return "";
  }
}
