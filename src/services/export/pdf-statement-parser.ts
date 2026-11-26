import type { TransactionType } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import forge from 'node-forge';
import pako from 'pako';

export interface ParsedPdfTransaction {
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  referenceNumber?: string;
  note?: string;
  balance?: number;
}

export interface BankProfile {
  id: string;
  name: string;
  passwordHint: string;
}

export const SUPPORTED_BANK_PROFILES: BankProfile[] = [
  {
    id: 'auto',
    name: 'Auto-Detect',
    passwordHint: 'Enter your statement password (usually PAN, DOB, or Mobile digits)',
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    passwordHint: 'Customer ID (all caps) or PAN in uppercase',
  },
  {
    id: 'sbi',
    name: 'State Bank of India (SBI)',
    passwordHint:
      '11-digit Account Number OR Last 5 digits of mobile + DOB (DDMM) OR DOB (DDMMYYYY)',
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    passwordHint: 'First 4 letters of name (lowercase) + DOB (DDMM)',
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    passwordHint: 'First 4 letters of name (uppercase) + Last 4 digits of account',
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra',
    passwordHint: 'Customer Relationship Number (CRN) or DOB (DDMMYYYY)',
  },
  {
    id: 'generic',
    name: 'Other Bank',
    passwordHint: 'Enter your statement unlock password',
  },
];

export interface PdfParseResult {
  success: boolean;
  isEncrypted: boolean;
  transactions: ParsedPdfTransaction[];
  errors: string[];
  closingBalance?: number;
  statementDate?: string;
}

const PASSWORD_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export function checkIsPdfEncrypted(rawContent: string): boolean {
  if (!rawContent) return false;
  const encryptionPatterns = [
    /\/encrypt\b/i,
    /\/filter\s*\/\s*(?:standard|adobe\.pubsec|stdcf)/i,
    /\/type\s*\/encrypt\b/i,
    /\/stdcf\b/i,
    /\/aesv[23]\b/i,
    /\/o\s*(?:<|\()/i,
    /\/u\s*(?:<|\()/i,
    /\/p\s+-[0-9]+/i,
    /\/perms\b/i,
    /\/standard\b/i,
  ];
  return encryptionPatterns.some((pattern) => pattern.test(rawContent));
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_MAP = new Int8Array(256).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_MAP[B64_CHARS.charCodeAt(i)] = i;
}

function base64ToUint8(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const len = clean.length;
  let validLen = len;
  if (validLen > 0 && clean[validLen - 1] === '=') validLen--;
  if (validLen > 0 && clean[validLen - 1] === '=') validLen--;

  const outLen = Math.floor((validLen * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = B64_MAP[clean.charCodeAt(i)];
    const c1 = B64_MAP[clean.charCodeAt(i + 1)];
    const c2 = i + 2 < len && clean[i + 2] !== '=' ? B64_MAP[clean.charCodeAt(i + 2)] : 0;
    const c3 = i + 3 < len && clean[i + 3] !== '=' ? B64_MAP[clean.charCodeAt(i + 3)] : 0;

    if (c0 === -1 || c1 === -1) break;

    const b0 = (c0 << 2) | (c1 >> 4);
    if (outIdx < outLen) out[outIdx++] = b0;

    if (i + 2 < len && clean[i + 2] !== '=') {
      const b1 = ((c1 & 15) << 4) | (c2 >> 2);
      if (outIdx < outLen) out[outIdx++] = b1;
    }
    if (i + 3 < len && clean[i + 3] !== '=') {
      const b2 = ((c2 & 3) << 6) | c3;
      if (outIdx < outLen) out[outIdx++] = b2;
    }
  }

  return out;
}

function uint8ToBinary(u8: Uint8Array): string {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    const slice = u8.subarray(i, Math.min(i + chunk, u8.length));
    str += String.fromCharCode.apply(null, Array.from(slice));
  }
  return str;
}

function binaryToUint8(bin: string): Uint8Array {
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    u8[i] = bin.charCodeAt(i) & 0xff;
  }
  return u8;
}

function utf8ToUint8(str: string): Uint8Array {
  const utf8Bin = forge.util.encodeUtf8(str);
  return binaryToUint8(utf8Bin);
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }
  let i = 0;
  j = 0;
  const out = new Uint8Array(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Unescapes PDF literal string escapes while preserving raw bytes (including NUL `\0`).
 * Crucial for binary security dictionary entries (/O, /U, /ID) and 2-byte CID glyph streams.
 */
function decodePdfLiteralRaw(str: string): string {
  let out = '';
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (next >= '0' && next <= '7') {
        let oct = next;
        let step = 2;
        while (step < 4 && i + step < str.length && str[i + step] >= '0' && str[i + step] <= '7') {
          oct += str[i + step];
          step++;
        }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        i += step;
        continue;
      }
      if (next === 'n') {
        out += '\n';
        i += 2;
        continue;
      }
      if (next === 'r') {
        out += '\r';
        i += 2;
        continue;
      }
      if (next === 't') {
        out += '\t';
        i += 2;
        continue;
      }
      if (next === 'b') {
        out += '\b';
        i += 2;
        continue;
      }
      if (next === 'f') {
        out += '\f';
        i += 2;
        continue;
      }
      if (next === '\r') {
        i += i + 2 < str.length && str[i + 2] === '\n' ? 3 : 2;
        continue;
      }
      if (next === '\n') {
        i += 2;
        continue;
      }
      out += next;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface ParsedCMap {
  map: Map<number, string>;
  codeByteWidth: 1 | 2 | 'auto';
}

function decodeDestinationHex(dstHex: string): string {
  let dstStr = '';
  for (let k = 0; k < dstHex.length; k += 4) {
    const chunk = dstHex.substring(k, Math.min(k + 4, dstHex.length));
    const charCode = parseInt(chunk, 16);
    if (!isNaN(charCode) && charCode > 0) {
      dstStr += String.fromCharCode(charCode);
    }
  }
  return dstStr;
}

function parseCMap(cmapStr: string): ParsedCMap {
  const map = new Map<number, string>();
  let detectedWidth: 1 | 2 | 'auto' = 'auto';
  const cleanedCmapStr = cmapStr.replace(/%[^\r\n]*/g, '');

  const codespaceRegex = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let csMatch: RegExpExecArray | null;
  while ((csMatch = codespaceRegex.exec(cleanedCmapStr)) !== null) {
    const tokens = csMatch[1].match(/<[0-9a-fA-F\s]+>/g) || [];
    for (const tok of tokens) {
      const hex = tok.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 2) {
        detectedWidth = 1;
      } else if (hex.length === 4) {
        detectedWidth = 2;
      }
    }
  }

  const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let charMatch: RegExpExecArray | null;
  while ((charMatch = bfCharRegex.exec(cleanedCmapStr)) !== null) {
    const tokens = charMatch[1].trim().match(/<[0-9a-fA-F\s]+>/g) || [];
    for (let i = 0; i < tokens.length - 1; i += 2) {
      const srcHex = tokens[i].replace(/[^0-9a-fA-F]/g, '');
      const dstHex = tokens[i + 1].replace(/[^0-9a-fA-F]/g, '');
      if (detectedWidth === 'auto' && srcHex.length === 2) detectedWidth = 1;
      else if (detectedWidth === 'auto' && srcHex.length === 4) detectedWidth = 2;

      const srcCode = parseInt(srcHex, 16);
      const dstStr = decodeDestinationHex(dstHex);
      if (!isNaN(srcCode) && dstStr) map.set(srcCode, dstStr);
    }
  }

  const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = bfRangeRegex.exec(cleanedCmapStr)) !== null) {
    const tokens = rangeMatch[1].trim().match(/(?:<[0-9a-fA-F\s]+>|\[[\s\S]*?\])/g) || [];
    let i = 0;
    while (i < tokens.length) {
      const startTok = tokens[i++];
      const endTok = tokens[i++];
      const dstTok = tokens[i++];
      if (!startTok || !endTok || !dstTok) break;

      const startHex = startTok.replace(/[^0-9a-fA-F]/g, '');
      const endHex = endTok.replace(/[^0-9a-fA-F]/g, '');
      if (detectedWidth === 'auto' && startHex.length === 2) detectedWidth = 1;
      else if (detectedWidth === 'auto' && startHex.length === 4) detectedWidth = 2;

      const startCode = parseInt(startHex, 16);
      const endCode = parseInt(endHex, 16);
      if (isNaN(startCode) || isNaN(endCode) || endCode < startCode) continue;

      if (dstTok.startsWith('[')) {
        const destHexes = dstTok.replace(/[\[\]]/g, '').trim().match(/<[0-9a-fA-F\s]+>/g) || [];
        for (let code = startCode; code <= endCode && code - startCode < destHexes.length; code++) {
          const dHex = destHexes[code - startCode].replace(/[^0-9a-fA-F]/g, '');
          const dstStr = decodeDestinationHex(dHex);
          if (dstStr) map.set(code, dstStr);
        }
      } else {
        const dstHex = dstTok.replace(/[^0-9a-fA-F]/g, '');
        const dstStart = parseInt(dstHex, 16);
        if (!isNaN(dstStart)) {
          const limit = Math.min(endCode, startCode + 4096);
          for (let code = startCode; code <= limit; code++) {
            const charCode = dstStart + (code - startCode);
            if (charCode > 0) map.set(code, String.fromCharCode(charCode));
          }
        }
      }
    }
  }

  return { map, codeByteWidth: detectedWidth };
}

function mergeParsedCMap(target: ParsedCMap, source: ParsedCMap): void {
  for (const [k, v] of source.map.entries()) {
    target.map.set(k, v);
  }
  if (target.codeByteWidth === 'auto' && source.codeByteWidth !== 'auto') {
    target.codeByteWidth = source.codeByteWidth;
  } else if (
    target.codeByteWidth !== 'auto' &&
    source.codeByteWidth !== 'auto' &&
    target.codeByteWidth !== source.codeByteWidth
  ) {
    target.codeByteWidth = 'auto';
  }
}

function decodeRawBytesWithCMap(bytes: Uint8Array, cmap?: ParsedCMap): string {
  if (bytes.length === 0) return '';

  if (cmap && cmap.map.size > 0) {
    const tryTwoByte = () => {
      if (bytes.length < 2 || bytes.length % 2 !== 0) return null;
      let out = '';
      let mappedCount = 0;
      for (let i = 0; i < bytes.length; i += 2) {
        const cid = (bytes[i] << 8) | bytes[i + 1];
        const mapped = cmap.map.get(cid);
        if (mapped !== undefined) {
          out += mapped;
          mappedCount++;
        } else if (cid > 0) {
          out += String.fromCharCode(cid);
        }
      }
      return mappedCount > 0 ? out.replace(/\0/g, '') : null;
    };

    const tryOneByte = () => {
      let out = '';
      let mappedCount = 0;
      for (let i = 0; i < bytes.length; i++) {
        const cid = bytes[i];
        const mapped = cmap.map.get(cid);
        if (mapped !== undefined) {
          out += mapped;
          mappedCount++;
        } else if (cid > 0) {
          out += String.fromCharCode(cid);
        }
      }
      return mappedCount > 0 ? out.replace(/\0/g, '') : null;
    };

    if (cmap.codeByteWidth === 1) {
      const res1 = tryOneByte();
      if (res1 !== null) return res1;
      const res2 = tryTwoByte();
      if (res2 !== null) return res2;
    } else {
      const res2 = tryTwoByte();
      if (res2 !== null) return res2;
      const res1 = tryOneByte();
      if (res1 !== null) return res1;
    }
  }

  // UTF-16BE BOM or 2-byte big-endian ASCII
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out.replace(/\0/g, '');
  }

  if (bytes.length >= 4 && bytes.length % 2 === 0 && bytes[0] === 0x00 && bytes[1] >= 0x20 && bytes[1] <= 0x7e) {
    let allHighZero = true;
    for (let i = 0; i < bytes.length; i += 2) {
      if (bytes[i] !== 0x00) {
        allHighZero = false;
        break;
      }
    }
    if (allHighZero) {
      let out = '';
      for (let i = 0; i < bytes.length; i += 2) {
        out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return out.replace(/\0/g, '');
    }
  }

  return uint8ToBinary(bytes).replace(/\0/g, '');
}

function decodePdfHex(hex: string, cmap?: ParsedCMap): string {
  let clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 0) return '';
  if (clean.length % 2 !== 0) clean += '0';
  return decodeRawBytesWithCMap(hexToBytes(clean), cmap);
}

function isPurePrintableAscii(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b > 0x7e) {
      return false;
    }
  }
  return true;
}

function decodePdfLiteralText(
  rawContent: string,
  cmap?: ParsedCMap,
  isFallbackCMap = false
): string {
  const unescaped = decodePdfLiteralRaw(rawContent);
  const bytes = binaryToUint8(unescaped);
  const effectiveCMap =
    cmap && isFallbackCMap && isPurePrintableAscii(bytes) ? undefined : cmap;
  return decodeRawBytesWithCMap(bytes, effectiveCMap);
}

function parsePdfLiteralToken(str: string, startIdx: number): { raw: string; nextIdx: number } {
  let depth = 1;
  let i = startIdx + 1;
  let raw = '';
  while (i < str.length && depth > 0) {
    const c = str[i];
    if (c === '\\') {
      raw += c;
      i++;
      if (i < str.length) {
        raw += str[i];
      }
    } else if (c === '(') {
      depth++;
      raw += c;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return { raw, nextIdx: i + 1 };
      }
      raw += c;
    } else {
      raw += c;
    }
    i++;
  }
  return { raw, nextIdx: i };
}

function parseTjArray(
  str: string,
  startIdx: number,
  cmap?: ParsedCMap,
  isFallbackCMap = false
): { text: string; nextIdx: number } {
  let i = startIdx + 1;
  let result = '';
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length || str[i] === ']') {
      i++;
      break;
    }
    if (str[i] === '(') {
      const parsed = parsePdfLiteralToken(str, i);
      result += decodePdfLiteralText(parsed.raw, cmap, isFallbackCMap);
      i = parsed.nextIdx;
    } else if (str[i] === '<') {
      const end = str.indexOf('>', i);
      if (end !== -1) {
        result += decodePdfHex(str.substring(i + 1, end), cmap);
        i = end + 1;
      } else {
        break;
      }
    } else {
      const numMatch = str.substring(i).match(/^([+-]?(?:\d+\.?\d*|\.\d+))/);
      if (numMatch) {
        const num = parseFloat(numMatch[1]);
        if (num <= -120 && !result.endsWith(' ')) {
          result += ' ';
        }
        i += numMatch[0].length;
      } else {
        i++;
      }
    }
  }
  return { text: result, nextIdx: i };
}

interface EncryptDictInfo {
  v: number;
  r: number;
  length: number;
  p: number;
  o: Uint8Array;
  u: Uint8Array;
  oe?: Uint8Array;
  ue?: Uint8Array;
  id1: Uint8Array;
  isAes: boolean;
  encryptMetadataFalse: boolean;
  stmfIsIdentity: boolean;
}

function extractBalancedDict(
  raw: string,
  startFromIndex: number
): { dictContent: string; dictEnd: number } | null {
  const dictStart = raw.indexOf('<<', startFromIndex);
  if (dictStart === -1) return null;

  const maxScan = Math.min(raw.length, dictStart + 65536);
  let depth = 0;
  let dictEnd = -1;
  let i = dictStart;
  let inString = false;
  let strDepth = 0;

  while (i < maxScan) {
    const c = raw[i];
    const next = raw[i + 1];

    if (!inString) {
      if (c === '(') {
        inString = true;
        strDepth = 1;
      } else if (c === '<' && next === '<') {
        depth++;
        i++;
      } else if (c === '<') {
        const hexClose = raw.indexOf('>', i + 1);
        if (hexClose !== -1 && hexClose < maxScan && /^[0-9a-fA-F\s]*$/.test(raw.slice(i + 1, hexClose))) {
          i = hexClose + 1;
          continue;
        }
      } else if (c === '>' && next === '>') {
        depth--;
        i++;
        if (depth === 0) {
          dictEnd = i + 1;
          break;
        }
      }
    } else {
      if (c === '\\') {
        i++;
      } else if (c === '(') {
        strDepth++;
      } else if (c === ')') {
        strDepth--;
        if (strDepth === 0) inString = false;
      }
    }
    i++;
  }

  if (dictEnd === -1) return null;
  return { dictContent: raw.substring(dictStart + 2, dictEnd - 2), dictEnd };
}

/**
 * Strips nested `<< ... >>` sub-dictionaries so top-level entries like `/Length`
 * do not accidentally match nested `/CF << /StdCF << /Length 16 >> >>` values.
 */
function stripNestedDicts(dictContent: string): string {
  let out = '';
  let depth = 0;
  let i = 0;
  let inString = false;
  let strDepth = 0;

  while (i < dictContent.length) {
    const c = dictContent[i];
    const next = dictContent[i + 1];
    if (!inString) {
      if (c === '(') {
        inString = true;
        strDepth = 1;
        if (depth === 0) out += c;
      } else if (c === '<' && next === '<') {
        depth++;
        i++;
      } else if (c === '<') {
        const hexClose = dictContent.indexOf('>', i + 1);
        if (hexClose !== -1 && /^[0-9a-fA-F\s]*$/.test(dictContent.slice(i + 1, hexClose))) {
          if (depth === 0) out += dictContent.slice(i, hexClose + 1);
          i = hexClose + 1;
          continue;
        }
        if (depth === 0) out += c;
      } else if (c === '>' && next === '>') {
        depth = Math.max(0, depth - 1);
        i++;
      } else if (depth === 0) {
        out += c;
      }
    } else {
      if (depth === 0) out += c;
      if (c === '\\') {
        if (i + 1 < dictContent.length) {
          i++;
          if (depth === 0) out += dictContent[i];
        }
      } else if (c === '(') {
        strDepth++;
      } else if (c === ')') {
        strDepth--;
        if (strDepth === 0) inString = false;
      }
    }
    i++;
  }
  return out;
}

function parsePdfDictBinaryString(dictStr: string, key: string): Uint8Array | null {
  const hexRegex = new RegExp(`/${key}\\s*<([0-9a-fA-F\\s]+)>`);
  const hexMatch = dictStr.match(hexRegex);
  if (hexMatch) {
    return hexToBytes(hexMatch[1]);
  }

  const litRegex = new RegExp(`/${key}\\s*\\(`);
  const litMatch = dictStr.match(litRegex);
  if (litMatch && litMatch.index !== undefined) {
    const parenIdx = dictStr.indexOf('(', litMatch.index);
    if (parenIdx !== -1) {
      const parsed = parsePdfLiteralToken(dictStr, parenIdx);
      return binaryToUint8(decodePdfLiteralRaw(parsed.raw));
    }
  }
  return null;
}

function findLastRegexMatch(input: string, regex: RegExp): RegExpExecArray | null {
  const globalRegex = new RegExp(
    regex.source,
    regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  );
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = globalRegex.exec(input)) !== null) {
    last = match;
  }
  return last;
}

function parseEncryptDictionary(rawLatin1: string): EncryptDictInfo | null {
  let encryptDictStr = '';

  const encryptRefMatch = findLastRegexMatch(rawLatin1, /\/Encrypt\s+(\d+)\s+(\d+)\s+R\b/);
  if (encryptRefMatch) {
    const objNum = encryptRefMatch[1];
    const genNum = encryptRefMatch[2];
    const objRegex = new RegExp(`\\b${objNum}\\s+${genNum}\\s+obj\\b`, 'g');
    const objMatch = findLastRegexMatch(rawLatin1, objRegex);
    if (objMatch && objMatch.index !== undefined) {
      const extracted = extractBalancedDict(rawLatin1, objMatch.index);
      if (extracted) {
        encryptDictStr = extracted.dictContent;
      }
    }
  }

  if (!encryptDictStr) {
    const inlineMatch = findLastRegexMatch(rawLatin1, /\/Encrypt\s*<</);
    const inlineIdx = inlineMatch ? inlineMatch.index : rawLatin1.lastIndexOf('/Encrypt');
    if (inlineIdx !== -1) {
      const extracted = extractBalancedDict(rawLatin1, inlineIdx);
      if (extracted) {
        encryptDictStr = extracted.dictContent;
      }
    }
  }

  if (!encryptDictStr) return null;

  const topLevel = stripNestedDicts(encryptDictStr);
  const vMatch = topLevel.match(/\/V\s+(\d+)/);
  const rMatch = topLevel.match(/\/R\s+(\d+)/);
  const lenMatch = topLevel.match(/\/Length\s+(\d+)/);
  const pMatch = topLevel.match(/\/P\s+(-?\d+)/);

  const o = parsePdfDictBinaryString(topLevel, 'O') || parsePdfDictBinaryString(encryptDictStr, 'O');
  const u = parsePdfDictBinaryString(topLevel, 'U') || parsePdfDictBinaryString(encryptDictStr, 'U');
  if (!o || !u) return null;

  const oe = parsePdfDictBinaryString(topLevel, 'OE') || undefined;
  const ue = parsePdfDictBinaryString(topLevel, 'UE') || undefined;

  const v = vMatch ? parseInt(vMatch[1], 10) : 1;
  const r = rMatch ? parseInt(rMatch[1], 10) : 2;
  const defaultLength = v >= 5 ? 256 : v === 1 ? 40 : 128;
  let length = lenMatch ? parseInt(lenMatch[1], 10) : defaultLength;
  if (v >= 4 && length < 40) {
    length = v >= 5 ? 256 : 128;
  }
  const p = pMatch ? parseInt(pMatch[1], 10) : -12;

  let id1: Uint8Array = hexToBytes('');
  const idMatch = findLastRegexMatch(rawLatin1, /\/ID\s*\[\s*<([0-9a-fA-F\s]+)>/);
  if (idMatch) {
    id1 = hexToBytes(idMatch[1]);
  } else {
    const idLitMatch = findLastRegexMatch(rawLatin1, /\/ID\s*\[\s*\(/);
    if (idLitMatch && idLitMatch.index !== undefined) {
      const parenIdx = rawLatin1.indexOf('(', idLitMatch.index);
      if (parenIdx !== -1) {
        const parsed = parsePdfLiteralToken(rawLatin1, parenIdx);
        id1 = binaryToUint8(decodePdfLiteralRaw(parsed.raw));
      }
    }
  }

  const stmfName = topLevel.match(/\/StmF\s*\/([A-Za-z0-9_.\-+]+)/)?.[1];
  let stmfCfm: string | null = null;
  if (stmfName && stmfName !== 'Identity') {
    const cfIdx = encryptDictStr.indexOf('/CF');
    if (cfIdx !== -1) {
      const cfDict = extractBalancedDict(encryptDictStr, cfIdx);
      const filterIdx = cfDict?.dictContent.indexOf(`/${stmfName}`) ?? -1;
      if (cfDict && filterIdx !== -1) {
        const filterSub = extractBalancedDict(cfDict.dictContent, filterIdx);
        stmfCfm = filterSub?.dictContent.match(/\/CFM\s*\/([A-Za-z0-9]+)/)?.[1] ?? null;
      }
    }
  }

  const isAes =
    v >= 5 ||
    stmfCfm === 'AESV2' ||
    stmfCfm === 'AESV3' ||
    (stmfCfm !== 'V2' &&
      (encryptDictStr.includes('/AESV2') ||
        encryptDictStr.includes('/AESV3') ||
        (v === 4 && !/\/CFM\s*\/V2\b/.test(encryptDictStr))));

  const encryptMetadataFalse = /\/EncryptMetadata\s+false\b/.test(encryptDictStr);
  const stmfIsIdentity = stmfName === 'Identity';

  return {
    v,
    r,
    length,
    p,
    o,
    u,
    oe,
    ue,
    id1,
    isAes,
    encryptMetadataFalse,
    stmfIsIdentity,
  };
}

function deriveEncryptionKeyR234(
  password: string,
  encryptInfo: EncryptDictInfo
): Uint8Array {
  const { r, length, p, o, id1, encryptMetadataFalse } = encryptInfo;
  const keyLengthBytes = Math.max(5, Math.min(16, Math.floor(length / 8)));

  const pwdBytes = new Uint8Array(Array.from(password).map((c) => c.charCodeAt(0) & 0xff));
  const padded = new Uint8Array(32);
  padded.set(pwdBytes.slice(0, 32));
  if (pwdBytes.length < 32) {
    padded.set(PASSWORD_PADDING.slice(0, 32 - pwdBytes.length), pwdBytes.length);
  }

  const md5 = forge.md.md5.create();
  md5.update(uint8ToBinary(padded));
  md5.update(uint8ToBinary(o));

  const pBytes = new Uint8Array(4);
  const pUnsigned = p >>> 0;
  pBytes[0] = pUnsigned & 0xff;
  pBytes[1] = (pUnsigned >> 8) & 0xff;
  pBytes[2] = (pUnsigned >> 16) & 0xff;
  pBytes[3] = (pUnsigned >> 24) & 0xff;
  md5.update(uint8ToBinary(pBytes));

  md5.update(uint8ToBinary(id1));

  if (encryptMetadataFalse) {
    md5.update(uint8ToBinary(new Uint8Array([0xff, 0xff, 0xff, 0xff])));
  }

  let hash = binaryToUint8(md5.digest().getBytes());

  if (r >= 3) {
    for (let i = 0; i < 50; i++) {
      const iterMd5 = forge.md.md5.create();
      iterMd5.update(uint8ToBinary(hash.slice(0, keyLengthBytes)));
      hash = binaryToUint8(iterMd5.digest().getBytes());
    }
  }

  return hash.slice(0, keyLengthBytes);
}

function verifyUserPasswordR234(encKey: Uint8Array, encryptInfo: EncryptDictInfo): boolean {
  const { r, u, id1 } = encryptInfo;

  if (r === 2) {
    const test = rc4(encKey, PASSWORD_PADDING);
    for (let i = 0; i < 32; i++) {
      if (test[i] !== u[i]) return false;
    }
    return true;
  }

  const md5 = forge.md.md5.create();
  md5.update(uint8ToBinary(PASSWORD_PADDING));
  md5.update(uint8ToBinary(id1));
  let data = binaryToUint8(md5.digest().getBytes());

  for (let i = 0; i < 20; i++) {
    const iterKey = new Uint8Array(encKey.length);
    for (let j = 0; j < encKey.length; j++) {
      iterKey[j] = encKey[j] ^ i;
    }
    data = rc4(iterKey, data);
  }

  for (let i = 0; i < 16; i++) {
    if (data[i] !== u[i]) return false;
  }
  return true;
}

function shaDigest(algo: 'sha256' | 'sha384' | 'sha512', data: Uint8Array): Uint8Array {
  const md =
    algo === 'sha256'
      ? forge.md.sha256.create()
      : algo === 'sha384'
        ? forge.md.sha384.create()
        : forge.md.sha512.create();
  md.update(uint8ToBinary(data));
  return binaryToUint8(md.digest().getBytes());
}

function aesCbcNoPaddingDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
  try {
    const decipher = forge.cipher.createDecipher('AES-CBC', uint8ToBinary(key));
    const mode = decipher.mode as unknown as { unpad?: () => boolean };
    mode.unpad = () => true;
    decipher.start({ iv: uint8ToBinary(iv) });
    decipher.update(forge.util.createBuffer(uint8ToBinary(ciphertext)));
    if (decipher.finish()) {
      return binaryToUint8(decipher.output.getBytes());
    }
  } catch {
    // Decryption failed
  }
  return null;
}

function aesCbcNoPaddingEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const cipher = forge.cipher.createCipher('AES-CBC', uint8ToBinary(key));
  const mode = cipher.mode as unknown as { pad?: () => boolean };
  mode.pad = () => true;
  cipher.start({ iv: uint8ToBinary(iv) });
  cipher.update(forge.util.createBuffer(uint8ToBinary(plaintext)));
  cipher.finish();
  return binaryToUint8(cipher.output.getBytes());
}

function computeAlgorithm2BHash(
  pwdBytes: Uint8Array,
  salt: Uint8Array,
  userKey: Uint8Array
): Uint8Array {
  const initInput = new Uint8Array(pwdBytes.length + salt.length + userKey.length);
  initInput.set(pwdBytes, 0);
  initInput.set(salt, pwdBytes.length);
  initInput.set(userKey, pwdBytes.length + salt.length);

  let k = shaDigest('sha256', initInput);
  let round = 0;
  let lastByte = 0;

  while (round < 64 || lastByte > round - 32) {
    const unitLen = pwdBytes.length + k.length + userKey.length;
    const k1 = new Uint8Array(unitLen * 64);
    const unit = new Uint8Array(unitLen);
    unit.set(pwdBytes, 0);
    unit.set(k, pwdBytes.length);
    unit.set(userKey, pwdBytes.length + k.length);
    for (let rep = 0; rep < 64; rep++) {
      k1.set(unit, rep * unitLen);
    }

    const aesKey = k.subarray(0, 16);
    const aesIv = k.subarray(16, 32);
    const e = aesCbcNoPaddingEncrypt(aesKey, aesIv, k1);

    let mod3 = 0;
    for (let idx = 0; idx < 16; idx++) {
      mod3 = (mod3 * 256 + e[idx]) % 3;
    }

    const algo = mod3 === 0 ? 'sha256' : mod3 === 1 ? 'sha384' : 'sha512';
    k = shaDigest(algo, e);
    lastByte = e[e.length - 1];
    round++;

    if (round > 256) break;
  }

  return k.slice(0, 32);
}

function bytesEqualPrefix(a: Uint8Array, b: Uint8Array, length: number): boolean {
  if (a.length < length || b.length < length) return false;
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function deriveEncryptionKeyR56(
  password: string,
  encryptInfo: EncryptDictInfo
): Uint8Array | null {
  const { r, u, o, ue, oe } = encryptInfo;
  if (u.length < 48) return null;

  const pwdBytes = utf8ToUint8(password).slice(0, 127);
  const validationSalt = u.subarray(32, 40);
  const keySalt = u.subarray(40, 48);
  const zeroIv = new Uint8Array(16);

  if (r === 5) {
    const checkInput = new Uint8Array(pwdBytes.length + 8);
    checkInput.set(pwdBytes, 0);
    checkInput.set(validationSalt, pwdBytes.length);
    const userHash = shaDigest('sha256', checkInput);
    if (bytesEqualPrefix(userHash, u, 32) && ue && ue.length >= 32) {
      const keyInput = new Uint8Array(pwdBytes.length + 8);
      keyInput.set(pwdBytes, 0);
      keyInput.set(keySalt, pwdBytes.length);
      const kek = shaDigest('sha256', keyInput);
      return aesCbcNoPaddingDecrypt(kek, zeroIv, ue.subarray(0, 32));
    }

    if (o.length >= 48 && oe && oe.length >= 32) {
      const oCheck = new Uint8Array(pwdBytes.length + 8 + 48);
      oCheck.set(pwdBytes, 0);
      oCheck.set(o.subarray(32, 40), pwdBytes.length);
      oCheck.set(u.subarray(0, 48), pwdBytes.length + 8);
      if (bytesEqualPrefix(shaDigest('sha256', oCheck), o, 32)) {
        const oKey = new Uint8Array(pwdBytes.length + 8 + 48);
        oKey.set(pwdBytes, 0);
        oKey.set(o.subarray(40, 48), pwdBytes.length);
        oKey.set(u.subarray(0, 48), pwdBytes.length + 8);
        return aesCbcNoPaddingDecrypt(shaDigest('sha256', oKey), zeroIv, oe.subarray(0, 32));
      }
    }
    return null;
  }

  // R === 6 (ISO 32000-2 Algorithm 2.A / 2.B)
  const emptyUserKey = new Uint8Array(0);
  const userCheckHash = computeAlgorithm2BHash(pwdBytes, validationSalt, emptyUserKey);
  if (bytesEqualPrefix(userCheckHash, u, 32) && ue && ue.length >= 32) {
    const kek = computeAlgorithm2BHash(pwdBytes, keySalt, emptyUserKey);
    return aesCbcNoPaddingDecrypt(kek, zeroIv, ue.subarray(0, 32));
  }

  if (o.length >= 48 && oe && oe.length >= 32) {
    const u48 = u.subarray(0, 48);
    const ownerCheckHash = computeAlgorithm2BHash(pwdBytes, o.subarray(32, 40), u48);
    if (bytesEqualPrefix(ownerCheckHash, o, 32)) {
      const kek = computeAlgorithm2BHash(pwdBytes, o.subarray(40, 48), u48);
      return aesCbcNoPaddingDecrypt(kek, zeroIv, oe.subarray(0, 32));
    }
  }

  return null;
}

function tryUnlockPdf(password: string, encryptInfo: EncryptDictInfo): Uint8Array | null {
  if (encryptInfo.v >= 5 || encryptInfo.r >= 5) {
    return deriveEncryptionKeyR56(password, encryptInfo);
  }
  const derived = deriveEncryptionKeyR234(password, encryptInfo);
  return verifyUserPasswordR234(derived, encryptInfo) ? derived : null;
}

function getObjectKey(
  encKey: Uint8Array,
  objNum: number,
  genNum: number,
  isAes: boolean
): Uint8Array {
  const seed = new Uint8Array(encKey.length + 5 + (isAes ? 4 : 0));
  seed.set(encKey);
  seed[encKey.length] = objNum & 0xff;
  seed[encKey.length + 1] = (objNum >> 8) & 0xff;
  seed[encKey.length + 2] = (objNum >> 16) & 0xff;
  seed[encKey.length + 3] = genNum & 0xff;
  seed[encKey.length + 4] = (genNum >> 8) & 0xff;
  if (isAes) {
    seed[encKey.length + 5] = 0x73; // 's'
    seed[encKey.length + 6] = 0x41; // 'A'
    seed[encKey.length + 7] = 0x6c; // 'l'
    seed[encKey.length + 8] = 0x54; // 'T'
  }

  const md5 = forge.md.md5.create();
  md5.update(uint8ToBinary(seed));
  const hash = binaryToUint8(md5.digest().getBytes());
  return hash.slice(0, Math.min(encKey.length + 5, 16));
}

function decryptStreamData(
  streamBytes: Uint8Array,
  objKey: Uint8Array,
  isAes: boolean
): Uint8Array {
  if (isAes) {
    if (streamBytes.length <= 16) return streamBytes;
    const iv = streamBytes.subarray(0, 16);
    const alignedLen = streamBytes.length - (streamBytes.length % 16);
    if (alignedLen <= 16) return streamBytes;
    const ciphertext = streamBytes.subarray(16, alignedLen);
    try {
      const decipher = forge.cipher.createDecipher('AES-CBC', uint8ToBinary(objKey));
      decipher.start({ iv: uint8ToBinary(iv) });
      decipher.update(forge.util.createBuffer(uint8ToBinary(ciphertext)));
      const ok = decipher.finish();
      if (ok) {
        return binaryToUint8(decipher.output.getBytes());
      }
    } catch {
      // Fallback if AES PKCS#7 padding check fails
    }

    const noPad = aesCbcNoPaddingDecrypt(objKey, iv, ciphertext);
    if (noPad) {
      const padByte = noPad[noPad.length - 1];
      if (padByte >= 1 && padByte <= 16 && noPad.length >= padByte) {
        let validPad = true;
        for (let k = noPad.length - padByte; k < noPad.length; k++) {
          if (noPad[k] !== padByte) {
            validPad = false;
            break;
          }
        }
        if (validPad) {
          return noPad.subarray(0, noPad.length - padByte);
        }
      }
      return noPad;
    }
    return streamBytes;
  }

  return rc4(objKey, streamBytes);
}

function decodeAsciiHex(data: Uint8Array): Uint8Array {
  const str = uint8ToBinary(data);
  const clean = str.split('>')[0].replace(/[^0-9a-fA-F]/g, '');
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  return hexToBytes(padded);
}

function decodeAscii85(data: Uint8Array): Uint8Array {
  const raw = uint8ToBinary(data);
  const body = raw.replace(/^<~/, '').split('~>')[0];
  const out: number[] = [];
  const tuple: number[] = [];

  for (let i = 0; i < body.length; i++) {
    const ch = body.charCodeAt(i);
    if (ch <= 32) continue;
    if (ch === 122 && tuple.length === 0) {
      // 'z' => 4 zero bytes
      out.push(0, 0, 0, 0);
      continue;
    }
    if (ch < 33 || ch > 117) continue;
    tuple.push(ch - 33);
    if (tuple.length === 5) {
      let val = 0;
      for (const d of tuple) val = val * 85 + d;
      out.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
      tuple.length = 0;
    }
  }

  if (tuple.length >= 2) {
    const count = tuple.length;
    while (tuple.length < 5) tuple.push(84);
    let val = 0;
    for (const d of tuple) val = val * 85 + d;
    for (let k = 0; k < count - 1; k++) {
      out.push((val >>> (24 - k * 8)) & 0xff);
    }
  }

  return new Uint8Array(out);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function applyPngPredictor(
  data: Uint8Array,
  columns: number,
  colors: number,
  bpc: number
): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowBytes = Math.ceil((columns * colors * bpc) / 8);
  const stride = rowBytes + 1;
  if (rowBytes <= 0 || data.length < stride) return data;

  const rowCount = Math.floor(data.length / stride);
  const out = new Uint8Array(rowCount * rowBytes);
  let prevRow = new Uint8Array(rowBytes);

  for (let r = 0; r < rowCount; r++) {
    const srcOff = r * stride;
    const filterType = data[srcOff];
    const dstOff = r * rowBytes;

    for (let x = 0; x < rowBytes; x++) {
      const raw = data[srcOff + 1 + x];
      const left = x >= bpp ? out[dstOff + x - bpp] : 0;
      const up = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;

      let val = raw;
      if (filterType === 1) val = (raw + left) & 0xff;
      else if (filterType === 2) val = (raw + up) & 0xff;
      else if (filterType === 3) val = (raw + ((left + up) >> 1)) & 0xff;
      else if (filterType === 4) val = (raw + paethPredictor(left, up, upLeft)) & 0xff;

      out[dstOff + x] = val;
    }

    prevRow = out.subarray(dstOff, dstOff + rowBytes);
  }

  return out;
}

function decodeLzw(data: Uint8Array, earlyChange = 1): Uint8Array | null {
  if (data.length === 0) return null;
  let bitPos = 0;
  const totalBits = data.length * 8;

  const readCode = (width: number): number => {
    if (bitPos + width > totalBits) return -1;
    let code = 0;
    for (let k = 0; k < width; k++) {
      const byteIdx = (bitPos + k) >> 3;
      const bitIdx = 7 - ((bitPos + k) & 7);
      code = (code << 1) | ((data[byteIdx] >> bitIdx) & 1);
    }
    bitPos += width;
    return code;
  };

  const resetTable = (): number[][] => {
    const t: number[][] = [];
    for (let i = 0; i < 256; i++) t.push([i]);
    t.push([], []); // 256 Clear, 257 EOD
    return t;
  };

  let table = resetTable();
  let codeWidth = 9;
  let prevEntry: number[] | null = null;
  const out: number[] = [];

  while (true) {
    const code = readCode(codeWidth);
    if (code === -1 || code === 257) break;

    if (code === 256) {
      table = resetTable();
      codeWidth = 9;
      prevEntry = null;
      continue;
    }

    let entry: number[] | null = null;
    if (code < table.length) {
      entry = table[code];
    } else if (code === table.length && prevEntry) {
      entry = [...prevEntry, prevEntry[0]];
    } else {
      break;
    }

    for (let i = 0; i < entry.length; i++) {
      out.push(entry[i]);
    }

    if (prevEntry && table.length < 4096) {
      table.push([...prevEntry, entry[0]]);
      const threshold = table.length + earlyChange;
      if (threshold === 512 || threshold === 1024 || threshold === 2048) {
        if (codeWidth < 12) codeWidth++;
      }
    }

    prevEntry = entry;
  }

  return out.length > 0 ? new Uint8Array(out) : null;
}

function decodeRunLength(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const len = data[i++];
    if (len === 128) break;
    if (len < 128) {
      const count = len + 1;
      for (let k = 0; k < count && i < data.length; k++) {
        out.push(data[i++]);
      }
    } else {
      const count = 257 - len;
      if (i >= data.length) break;
      const b = data[i++];
      for (let k = 0; k < count; k++) {
        out.push(b);
      }
    }
  }
  return new Uint8Array(out);
}

function applyTiffPredictor(
  data: Uint8Array,
  columns: number,
  colors: number,
  bpc: number
): Uint8Array {
  if (bpc !== 8 || columns <= 0 || colors <= 0) return data;
  const stride = columns * colors;
  const out = new Uint8Array(data.length);
  out.set(data);
  for (let row = 0; row < out.length; row += stride) {
    for (let col = colors; col < stride && row + col < out.length; col++) {
      out[row + col] = (out[row + col] + out[row + col - colors]) & 0xff;
    }
  }
  return out;
}

interface HuffmanTree {
  counts: Int32Array;
  symbols: Int32Array;
}

const DEFLATE_LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const DEFLATE_LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DEFLATE_DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DEFLATE_DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const DEFLATE_CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function buildHuffmanTree(lengths: number[], numSyms: number): HuffmanTree {
  const counts = new Int32Array(16);
  for (let i = 0; i < numSyms; i++) {
    counts[lengths[i]]++;
  }
  const offsets = new Int32Array(16);
  for (let len = 1; len < 15; len++) {
    offsets[len + 1] = offsets[len] + counts[len];
  }
  const symbols = new Int32Array(numSyms);
  for (let sym = 0; sym < numSyms; sym++) {
    const len = lengths[sym];
    if (len !== 0) {
      symbols[offsets[len]++] = sym;
    }
  }
  return { counts, symbols };
}

const FIXED_LIT_LENGTHS = Array.from({ length: 288 }, (_, s) =>
  s <= 143 ? 8 : s <= 255 ? 9 : s <= 279 ? 7 : 8
);
const FIXED_DIST_LENGTHS = Array.from({ length: 32 }, () => 5);
const FIXED_LIT_TREE = buildHuffmanTree(FIXED_LIT_LENGTHS, 288);
const FIXED_DIST_TREE = buildHuffmanTree(FIXED_DIST_LENGTHS, 32);

function inflateRawPureJs(rawDeflate: Uint8Array): Uint8Array | null {
  if (rawDeflate.length === 0) return null;
  let bytePos = 0;
  let bitBuf = 0;
  let bitCnt = 0;

  const ensureBits = (n: number): boolean => {
    while (bitCnt < n) {
      if (bytePos >= rawDeflate.length) return false;
      bitBuf |= rawDeflate[bytePos++] << bitCnt;
      bitCnt += 8;
    }
    return true;
  };

  const readBits = (n: number): number => {
    if (n === 0) return 0;
    if (!ensureBits(n)) return -1;
    const val = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return val;
  };

  const decodeSymbol = (tree: HuffmanTree): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      const bit = readBits(1);
      if (bit < 0) return -1;
      code |= bit;
      const count = tree.counts[len];
      if (code - count < first) {
        return tree.symbols[index + (code - first)];
      }
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    return -1;
  };

  const out: number[] = [];
  const maxOut = 32 * 1024 * 1024;
  let completed = false;

  while (out.length < maxOut) {
    const bfinal = readBits(1);
    const btype = readBits(2);
    if (bfinal < 0 || btype < 0) break;

    if (btype === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (bytePos + 4 > rawDeflate.length) break;
      const len = rawDeflate[bytePos] | (rawDeflate[bytePos + 1] << 8);
      const nlen = rawDeflate[bytePos + 2] | (rawDeflate[bytePos + 3] << 8);
      bytePos += 4;
      if ((len ^ 0xffff) !== nlen) break;
      const copyEnd = Math.min(rawDeflate.length, bytePos + len);
      for (let i = bytePos; i < copyEnd; i++) {
        out.push(rawDeflate[i]);
      }
      bytePos = copyEnd;
      completed = true;
    } else if (btype === 1 || btype === 2) {
      let litTree = FIXED_LIT_TREE;
      let distTree = FIXED_DIST_TREE;

      if (btype === 2) {
        const hlit = readBits(5);
        const hdist = readBits(5);
        const hclen = readBits(4);
        if (hlit < 0 || hdist < 0 || hclen < 0) break;
        const litCount = hlit + 257;
        const distCount = hdist + 1;
        const clenCount = hclen + 4;
        const clenLens = new Array<number>(19).fill(0);
        for (let i = 0; i < clenCount; i++) {
          const v = readBits(3);
          if (v < 0) return out.length > 0 ? new Uint8Array(out) : null;
          clenLens[DEFLATE_CODE_ORDER[i]] = v;
        }
        const clenTree = buildHuffmanTree(clenLens, 19);
        const allLens: number[] = [];
        const total = litCount + distCount;
        while (allLens.length < total) {
          const sym = decodeSymbol(clenTree);
          if (sym < 0) return out.length > 0 ? new Uint8Array(out) : null;
          if (sym < 16) {
            allLens.push(sym);
          } else if (sym === 16) {
            const rep = readBits(2);
            if (rep < 0 || allLens.length === 0) return null;
            const prev = allLens[allLens.length - 1];
            for (let r = 0; r < 3 + rep; r++) allLens.push(prev);
          } else {
            const rep = sym === 17 ? readBits(3) : readBits(7);
            const base = sym === 17 ? 3 : 11;
            if (rep < 0) return null;
            for (let r = 0; r < base + rep; r++) allLens.push(0);
          }
        }
        litTree = buildHuffmanTree(allLens.slice(0, litCount), litCount);
        distTree = buildHuffmanTree(allLens.slice(litCount, total), distCount);
      }

      let hitEnd = false;
      while (out.length < maxOut) {
        const sym = decodeSymbol(litTree);
        if (sym < 0) break;
        if (sym < 256) {
          out.push(sym);
        } else if (sym === 256) {
          hitEnd = true;
          completed = true;
          break;
        } else {
          const lIdx = sym - 257;
          if (lIdx < 0 || lIdx >= DEFLATE_LENGTH_BASE.length) break;
          const extraLen = readBits(DEFLATE_LENGTH_EXTRA[lIdx]);
          if (extraLen < 0) break;
          const matchLen = DEFLATE_LENGTH_BASE[lIdx] + extraLen;

          const dSym = decodeSymbol(distTree);
          if (dSym < 0 || dSym >= DEFLATE_DIST_BASE.length) break;
          const extraDist = readBits(DEFLATE_DIST_EXTRA[dSym]);
          if (extraDist < 0) break;
          const dist = DEFLATE_DIST_BASE[dSym] + extraDist;
          if (dist <= 0 || dist > out.length) break;

          for (let k = 0; k < matchLen; k++) {
            out.push(out[out.length - dist]);
          }
        }
      }
      if (!hitEnd) break;
    } else {
      break;
    }

    if (bfinal === 1) break;
  }

  return completed && out.length > 0 ? new Uint8Array(out) : null;
}

function getZlibHeaderOffset(data: Uint8Array): number {
  if (data.length < 2) return 0;
  const cmf = data[0];
  const flg = data[1];
  if ((cmf & 0x0f) === 8 && (((cmf << 8) | flg) % 31 === 0)) {
    return (flg & 0x20) !== 0 && data.length >= 6 ? 6 : 2;
  }
  return 0;
}

function inflateBytes(data: Uint8Array): { bytes: Uint8Array | null; error?: string } {
  const errors: string[] = [];
  const rawOffset = getZlibHeaderOffset(data);

  try {
    return { bytes: pako.inflate(data) };
  } catch (err: unknown) {
    errors.push(`pako:${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return { bytes: pako.inflateRaw(rawOffset > 0 ? data.subarray(rawOffset) : data) };
  } catch (err: unknown) {
    errors.push(`raw:${err instanceof Error ? err.message : String(err)}`);
  }

  if (
    data.length > 4 &&
    (data[0] === 0x0a || data[0] === 0x0d || data[0] === 0x20) &&
    getZlibHeaderOffset(data.subarray(1)) > 0
  ) {
    try {
      return { bytes: pako.inflate(data.subarray(1)) };
    } catch (err: unknown) {
      errors.push(`skip1:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const pure = inflateRawPureJs(rawOffset > 0 ? data.subarray(rawOffset) : data);
  if (pure) {
    return { bytes: pure };
  }

  if (rawOffset === 0 && data.length > 4) {
    const skip1Offset = getZlibHeaderOffset(data.subarray(1));
    if (skip1Offset > 0) {
      const pureSkip = inflateRawPureJs(data.subarray(1 + skip1Offset));
      if (pureSkip) return { bytes: pureSkip };
    }
  }

  return { bytes: null, error: errors.join('|').slice(0, 140) };
}

function hasSupportedStreamFilter(dictContent: string): boolean {
  return /\/(?:FlateDecode|Fl|LZWDecode|LZW|ASCII85Decode|A85|ASCIIHexDecode|AHx|RunLengthDecode|RL)\b/.test(
    dictContent
  );
}

function decompressStreamBytes(data: Uint8Array, dictContent: string): {
  bytes: Uint8Array;
  decompressed: boolean;
  inflateErr?: string;
} {
  let current = data;
  let changed = false;
  let inflateErr: string | undefined;

  const filters: string[] = [];
  const filterArrMatch = dictContent.match(/\/Filter\s*\[([^\]]+)\]/);
  if (filterArrMatch) {
    const names = filterArrMatch[1].match(/\/[A-Za-z0-9]+/g) || [];
    filters.push(...names);
  } else {
    const singleFilter = dictContent.match(/\/Filter\s*(\/[A-Za-z0-9]+)/);
    if (singleFilter) {
      filters.push(singleFilter[1]);
    }
  }

  const earlyMatch = dictContent.match(/\/EarlyChange\s+(\d+)/);
  const earlyChange = earlyMatch ? parseInt(earlyMatch[1], 10) : 1;

  for (const filter of filters) {
    if (filter === '/ASCIIHexDecode' || filter === '/AHx') {
      current = decodeAsciiHex(current);
      changed = true;
    } else if (filter === '/ASCII85Decode' || filter === '/A85') {
      current = decodeAscii85(current);
      changed = true;
    } else if (filter === '/FlateDecode' || filter === '/Fl') {
      const inflated = inflateBytes(current);
      if (inflated.bytes) {
        current = inflated.bytes;
        changed = true;
      } else if (inflated.error) {
        inflateErr = inflated.error;
      }
    } else if (filter === '/LZWDecode' || filter === '/LZW') {
      const lzw = decodeLzw(current, earlyChange);
      if (lzw) {
        current = lzw;
        changed = true;
      }
    } else if (filter === '/RunLengthDecode' || filter === '/RL') {
      current = decodeRunLength(current);
      changed = true;
    }
  }

  if (changed && dictContent.includes('/Predictor')) {
    const predMatch = dictContent.match(/\/Predictor\s+(\d+)/);
    const predictor = predMatch ? parseInt(predMatch[1], 10) : 1;
    const colsMatch = dictContent.match(/\/Columns\s+(\d+)/);
    const colorsMatch = dictContent.match(/\/Colors\s+(\d+)/);
    const bpcMatch = dictContent.match(/\/BitsPerComponent\s+(\d+)/);
    const columns = colsMatch ? parseInt(colsMatch[1], 10) : 1;
    const colors = colorsMatch ? parseInt(colorsMatch[1], 10) : 1;
    const bpc = bpcMatch ? parseInt(bpcMatch[1], 10) : 8;
    if (predictor >= 10) {
      current = applyPngPredictor(current, columns, colors, bpc);
    } else if (predictor === 2) {
      current = applyTiffPredictor(current, columns, colors, bpc);
    }
  }

  return { bytes: current, decompressed: changed, inflateErr };
}

interface StreamObject {
  objNum: number;
  genNum: number;
  dictContent: string;
  streamBytes: Uint8Array;
}

function findStreamObjects(
  pdfBytes: Uint8Array,
  rawLatin1: string,
  isAes: boolean
): { streams: StreamObject[]; nonStreamText: string } {
  const streams: StreamObject[] = [];
  const nonStreamParts: string[] = [];
  let lastNonStreamIdx = 0;

  const scalarIntObjects = new Map<string, number>();
  const scalarRegex =
    /(\d+)\s+(\d+)\s+obj(?:\s|%[^\r\n]*[\r\n]+)+(\d+)(?:\s|%[^\r\n]*[\r\n]+)+endobj\b/g;
  let scalarMatch: RegExpExecArray | null;
  while ((scalarMatch = scalarRegex.exec(rawLatin1)) !== null) {
    scalarIntObjects.set(`${scalarMatch[1]}_${scalarMatch[2]}`, parseInt(scalarMatch[3], 10));
  }

  const objRegex = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(rawLatin1)) !== null) {
    const objNum = parseInt(match[1], 10);
    const genNum = parseInt(match[2], 10);
    let afterObjIdx = match.index + match[0].length;

    while (afterObjIdx < rawLatin1.length) {
      if (/\s/.test(rawLatin1[afterObjIdx])) {
        afterObjIdx++;
      } else if (rawLatin1[afterObjIdx] === '%') {
        while (
          afterObjIdx < rawLatin1.length &&
          rawLatin1[afterObjIdx] !== '\n' &&
          rawLatin1[afterObjIdx] !== '\r'
        ) {
          afterObjIdx++;
        }
      } else {
        break;
      }
    }

    if (rawLatin1.substring(afterObjIdx, afterObjIdx + 2) !== '<<') {
      continue;
    }

    const extracted = extractBalancedDict(rawLatin1, afterObjIdx);
    if (!extracted) continue;

    const { dictContent, dictEnd } = extracted;
    const afterDict = rawLatin1.substring(dictEnd, dictEnd + 64);
    const streamMatch =
      afterDict.match(/^(?:\s|%[^\r\n]*[\r\n]+)*stream(?:\r\n|\n|\r)/) ||
      afterDict.match(/^(?:\s|%[^\r\n]*[\r\n]+)*stream[ \t]+(?:\r\n|\n)/);
    if (!streamMatch) {
      continue;
    }

    let streamStartIndex = dictEnd + streamMatch[0].length;

    let streamLength = -1;
    const indMatch = dictContent.match(/\/Length\s+(\d+)\s+(\d+)\s+R\b/);
    if (indMatch) {
      const resolved = scalarIntObjects.get(`${indMatch[1]}_${indMatch[2]}`);
      if (resolved !== undefined) {
        streamLength = resolved;
      }
    } else {
      const topDict = stripNestedDicts(dictContent);
      const dirMatch = topDict.match(/\/Length\s+(\d+)(?:[^\d]|$)/);
      if (dirMatch) streamLength = parseInt(dirMatch[1], 10);
    }

    const nearEndstream = (endIdx: number) =>
      /^[ \t]*(?:\r\n|\r|\n)?endstream\b/.test(rawLatin1.substring(endIdx, endIdx + 24));

    let streamEndIndex = -1;
    if (streamLength >= 0 && streamStartIndex + streamLength <= pdfBytes.length) {
      if (nearEndstream(streamStartIndex + streamLength)) {
        streamEndIndex = streamStartIndex + streamLength;
      } else if (
        streamMatch[0].endsWith('\r\n') &&
        streamStartIndex - 1 + streamLength <= pdfBytes.length &&
        nearEndstream(streamStartIndex - 1 + streamLength)
      ) {
        streamStartIndex -= 1;
        streamEndIndex = streamStartIndex + streamLength;
      } else if (rawLatin1.indexOf('endstream', streamStartIndex + streamLength - 4) === -1) {
        streamEndIndex = streamStartIndex + streamLength;
      }
    }

    if (streamEndIndex === -1) {
      const endstreamPos = rawLatin1.indexOf('endstream', streamStartIndex);
      if (endstreamPos > streamStartIndex) {
        const candidates: number[] = [];
        const addCandidate = (idx: number) => {
          if (idx > streamStartIndex && !candidates.includes(idx)) {
            candidates.push(idx);
          }
        };

        if (
          endstreamPos >= streamStartIndex + 2 &&
          rawLatin1[endstreamPos - 2] === '\r' &&
          rawLatin1[endstreamPos - 1] === '\n'
        ) {
          addCandidate(endstreamPos - 2);
        }
        if (
          endstreamPos >= streamStartIndex + 1 &&
          (rawLatin1[endstreamPos - 1] === '\n' || rawLatin1[endstreamPos - 1] === '\r')
        ) {
          addCandidate(endstreamPos - 1);
        }
        addCandidate(endstreamPos);

        let trimmed = candidates[0] ?? endstreamPos;
        while (
          trimmed > streamStartIndex &&
          (rawLatin1[trimmed - 1] === ' ' || rawLatin1[trimmed - 1] === '\t')
        ) {
          trimmed--;
        }
        addCandidate(trimmed);

        if (isAes) {
          const aesAligned = candidates.find((c) => {
            const len = c - streamStartIndex;
            return len >= 32 && len % 16 === 0;
          });
          streamEndIndex = aesAligned ?? candidates[0];
        } else {
          streamEndIndex = candidates[0];
        }
      }
    }

    if (streamEndIndex > streamStartIndex) {
      if (streamStartIndex > lastNonStreamIdx) {
        nonStreamParts.push(rawLatin1.substring(lastNonStreamIdx, streamStartIndex));
      }
      lastNonStreamIdx = streamEndIndex;

      streams.push({
        objNum,
        genNum,
        dictContent,
        streamBytes: pdfBytes.subarray(streamStartIndex, streamEndIndex),
      });
      objRegex.lastIndex = streamEndIndex;
    }
  }

  if (lastNonStreamIdx < rawLatin1.length) {
    nonStreamParts.push(rawLatin1.substring(lastNonStreamIdx));
  }

  return { streams, nonStreamText: nonStreamParts.join('\n') };
}

function extractObjectsFromObjStm(
  dictContent: string,
  text: string
): Array<{ objNum: number; content: string }> {
  const nMatch = dictContent.match(/\/N\s+(\d+)/);
  const firstMatch = dictContent.match(/\/First\s+(\d+)/);
  if (!nMatch || !firstMatch) return [];

  const n = parseInt(nMatch[1], 10);
  const first = parseInt(firstMatch[1], 10);
  if (!n || first <= 0 || first >= text.length) return [];

  const headerTokens = text
    .substring(0, first)
    .trim()
    .split(/\s+/)
    .map((v) => parseInt(v, 10));

  const objects: Array<{ objNum: number; content: string }> = [];
  for (let i = 0; i < n && i * 2 + 1 < headerTokens.length; i++) {
    const objNum = headerTokens[i * 2];
    const relOffset = headerTokens[i * 2 + 1];
    const nextOffset =
      i + 1 < n && (i + 1) * 2 + 1 < headerTokens.length
        ? headerTokens[(i + 1) * 2 + 1]
        : text.length - first;

    const start = first + relOffset;
    const end = Math.min(text.length, first + nextOffset);
    if (start >= first && end > start) {
      objects.push({ objNum, content: text.substring(start, end) });
    }
  }
  return objects;
}

export interface ExtractedStreamContent {
  coordRows: string[];
  seqLines: string[];
}

type Matrix6 = [number, number, number, number, number, number];

function multiplyMatrices(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function applyMatrixPoint(m: Matrix6, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

type ContentToken =
  | { kind: 'lit'; raw: string }
  | { kind: 'hex'; hex: string }
  | { kind: 'arr'; raw: string }
  | { kind: 'name'; value: string }
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: string };

function tokenizeContentStream(streamStr: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  const len = streamStr.length;
  let i = 0;

  while (i < len) {
    const c = streamStr[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === '%') {
      while (i < len && streamStr[i] !== '\n' && streamStr[i] !== '\r') i++;
      continue;
    }

    if (c === '(') {
      const parsed = parsePdfLiteralToken(streamStr, i);
      tokens.push({ kind: 'lit', raw: parsed.raw });
      i = parsed.nextIdx;
      continue;
    }

    if (c === '<') {
      if (streamStr[i + 1] === '<') {
        const dict = extractBalancedDict(streamStr, i);
        i = dict ? dict.dictEnd : i + 2;
        continue;
      }
      const close = streamStr.indexOf('>', i + 1);
      if (close !== -1) {
        tokens.push({ kind: 'hex', hex: streamStr.substring(i + 1, close) });
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }

    if (c === '[') {
      const start = i;
      i++;
      let depth = 1;
      let inStr = false;
      let strDepth = 0;
      while (i < len && depth > 0) {
        const ch = streamStr[i];
        if (!inStr) {
          if (ch === '(') {
            inStr = true;
            strDepth = 1;
          } else if (ch === '[') {
            depth++;
          } else if (ch === ']') {
            depth--;
          }
        } else {
          if (ch === '\\') {
            i++;
          } else if (ch === '(') {
            strDepth++;
          } else if (ch === ')') {
            strDepth--;
            if (strDepth === 0) inStr = false;
          }
        }
        i++;
      }
      tokens.push({ kind: 'arr', raw: streamStr.substring(start, i) });
      continue;
    }

    if (c === '/') {
      const start = i + 1;
      i++;
      while (i < len && !/[\s()<>\[\]{}/%]/.test(streamStr[i])) i++;
      tokens.push({ kind: 'name', value: streamStr.substring(start, i) });
      continue;
    }

    const start = i;
    while (i < len && !/[\s()<>\[\]{}/%]/.test(streamStr[i])) i++;
    if (i === start) {
      // Advance past stray closing/grouping delimiters (e.g., }, {, ], ), >)
      i++;
      continue;
    }
    const word = streamStr.substring(start, i);

    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ kind: 'num', value: parseFloat(word) });
    } else {
      tokens.push({ kind: 'op', value: word });
    }
  }

  return tokens;
}

function cleanExtractedText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ExtractTextOptions {
  yTolerance?: number;
  axis?: 'horizontal' | 'vertical';
}

export function extractTextFromStream(
  streamStr: string,
  fallbackCMap?: ParsedCMap,
  fontCMaps?: Map<string, ParsedCMap>,
  fontsWithoutCMap?: Set<string>,
  options?: ExtractTextOptions
): ExtractedStreamContent {
  const coordFragments: Array<{ x: number; y: number; text: string }> = [];
  const seqLines: string[] = [];
  let currentSeqLine = '';

  const tokens = tokenizeContentStream(streamStr);
  const operands: ContentToken[] = [];

  const ctmStack: Matrix6[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tlm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let inText = false;
  let activeFontName = '';

  const resolveActiveCMap = (): { cmap?: ParsedCMap; isFallback: boolean } => {
    if (activeFontName) {
      if (fontCMaps?.has(activeFontName)) {
        return { cmap: fontCMaps.get(activeFontName), isFallback: false };
      }
      if (fontsWithoutCMap?.has(activeFontName)) {
        return { cmap: undefined, isFallback: false };
      }
    }
    return { cmap: fallbackCMap, isFallback: Boolean(fallbackCMap) };
  };

  const flushSeqLine = () => {
    const cleaned = cleanExtractedText(currentSeqLine);
    if (cleaned) {
      seqLines.push(cleaned);
    }
    currentSeqLine = '';
  };

  const pushFragment = (rawText: string) => {
    const cleaned = cleanExtractedText(rawText);
    if (!cleaned) return;
    const composed = multiplyMatrices(tm, ctm);
    const pos = applyMatrixPoint(composed, 0, 0);
    coordFragments.push({ x: pos.x, y: pos.y, text: cleaned });
    currentSeqLine += (currentSeqLine ? ' ' : '') + cleaned;
  };

  const getNumericOperands = (count: number): number[] | null => {
    if (operands.length < count) return null;
    const slice = operands.slice(operands.length - count);
    const nums: number[] = [];
    for (const tok of slice) {
      if (tok.kind !== 'num' || !Number.isFinite(tok.value)) return null;
      nums.push(tok.value);
    }
    return nums;
  };

  for (const token of tokens) {
    if (token.kind !== 'op') {
      operands.push(token);
      continue;
    }

    const op = token.value;
    if (op === 'q') {
      ctmStack.push([...ctm]);
    } else if (op === 'Q') {
      const prev = ctmStack.pop();
      if (prev) ctm = prev;
    } else if (op === 'cm') {
      const nums = getNumericOperands(6);
      if (nums) {
        const nextCtm: Matrix6 = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
        ctm = multiplyMatrices(nextCtm, ctm);
      }
    } else if (op === 'BT') {
      inText = true;
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
      flushSeqLine();
    } else if (op === 'ET') {
      inText = false;
      flushSeqLine();
    } else if (op === 'Tf') {
      if (operands.length >= 2) {
        const fontTok = operands[operands.length - 2];
        if (fontTok.kind === 'name') {
          activeFontName = fontTok.value;
        }
      }
    } else if (op === 'Tm' && inText) {
      const nums = getNumericOperands(6);
      if (nums) {
        const prevY = tlm[5];
        tm = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
        tlm = [...tm];
        if (Math.abs(nums[5] - prevY) > 1.5) {
          flushSeqLine();
        }
      }
    } else if ((op === 'Td' || op === 'TD') && inText) {
      const nums = getNumericOperands(2);
      if (nums) {
        tlm = multiplyMatrices([1, 0, 0, 1, nums[0], nums[1]], tlm);
        tm = [...tlm];
        if (Math.abs(nums[1]) > 1.5) {
          flushSeqLine();
        }
      }
    } else if (op === 'T*' && inText) {
      tlm = multiplyMatrices([1, 0, 0, 1, 0, -12], tlm);
      tm = [...tlm];
      flushSeqLine();
    } else if ((op === 'Tj' || op === "'" || op === '"') && inText) {
      if (op === "'" || op === '"') {
        tlm = multiplyMatrices([1, 0, 0, 1, 0, -12], tlm);
        tm = [...tlm];
        flushSeqLine();
      }
      const last = operands[operands.length - 1];
      const { cmap: activeCMap, isFallback } = resolveActiveCMap();
      if (last?.kind === 'lit') {
        pushFragment(decodePdfLiteralText(last.raw, activeCMap, isFallback));
      } else if (last?.kind === 'hex') {
        pushFragment(decodePdfHex(last.hex, activeCMap));
      }
    } else if (op === 'TJ' && inText) {
      const last = operands[operands.length - 1];
      const { cmap: activeCMap, isFallback } = resolveActiveCMap();
      if (last?.kind === 'arr') {
        const parsedTj = parseTjArray(last.raw, 0, activeCMap, isFallback);
        pushFragment(parsedTj.text);
      }
    }

    operands.length = 0;
  }

  flushSeqLine();

  const coordRows: string[] = [];
  if (coordFragments.length > 0) {
    const tol = options?.yTolerance ?? 4.5;
    const vertical = options?.axis === 'vertical';
    const sorted = [...coordFragments].sort((a, b) => (vertical ? a.x - b.x : b.y - a.y));

    const clusters: Array<Array<{ x: number; y: number; text: string }>> = [];
    let currentCluster: Array<{ x: number; y: number; text: string }> = [];
    let anchor = 0;
    for (const f of sorted) {
      const primary = vertical ? f.x : f.y;
      if (currentCluster.length === 0 || Math.abs(primary - anchor) > tol) {
        if (currentCluster.length > 0) {
          clusters.push(currentCluster);
        }
        currentCluster = [f];
        anchor = primary;
      } else {
        currentCluster.push(f);
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    for (const row of clusters) {
      row.sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
      coordRows.push(row.map((g) => g.text).join(' '));
    }
  }

  return { coordRows, seqLines };
}

function inferCategory(narration: string): string {
  const lower = narration.toLowerCase();
  if (
    lower.includes('swiggy') ||
    lower.includes('zomato') ||
    lower.includes('food') ||
    lower.includes('restaurant') ||
    lower.includes('cafe')
  ) {
    return 'Dining';
  }
  if (
    lower.includes('blinkit') ||
    lower.includes('zepto') ||
    lower.includes('instamart') ||
    lower.includes('grocery') ||
    lower.includes('supermarket')
  ) {
    return 'Groceries';
  }
  if (
    lower.includes('uber') ||
    lower.includes('ola') ||
    lower.includes('fuel') ||
    lower.includes('petrol') ||
    lower.includes('metro')
  ) {
    return 'Transport';
  }
  if (
    lower.includes('amazon') ||
    lower.includes('flipkart') ||
    lower.includes('myntra') ||
    lower.includes('store')
  ) {
    return 'Shopping';
  }
  if (
    lower.includes('netflix') ||
    lower.includes('spotify') ||
    lower.includes('prime') ||
    lower.includes('hotstar')
  ) {
    return 'Subscriptions';
  }
  if (
    lower.includes('electricity') ||
    lower.includes('water') ||
    lower.includes('broadband') ||
    lower.includes('recharge') ||
    lower.includes('airtel') ||
    lower.includes('jio')
  ) {
    return 'Utilities';
  }
  if (
    lower.includes('hospital') ||
    lower.includes('pharmacy') ||
    lower.includes('apollo') ||
    lower.includes('medical') ||
    lower.includes('doctor')
  ) {
    return 'Health';
  }
  if (
    lower.includes('salary') ||
    lower.includes('payroll') ||
    lower.includes('stipend') ||
    lower.includes('interest')
  ) {
    return 'Salary';
  }
  if (lower.includes('rent') || lower.includes('landlord')) {
    return 'Rent';
  }
  return 'Other';
}

const MONTHS_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function normalizeDate(rawDate: string): string | null {
  const trimmed = rawDate
    .trim()
    .replace(/,/g, '')
    .replace(/\s*([./-])\s*/g, '$1')
    .replace(/\s+/g, ' ');
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const dayNum = parseInt(dmyMatch[1], 10);
    const monNum = parseInt(dmyMatch[2], 10);
    if (dayNum < 1 || dayNum > 31 || monNum < 1 || monNum > 12) return null;
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const ymdMatch = trimmed.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  const dMonMatch = trimmed.match(/^(\d{1,2})[\s./-]?([a-zA-Z]{3,9})[\s./-]?(\d{2,4})$/);
  if (dMonMatch) {
    const month = MONTHS_MAP[dMonMatch[2].toLowerCase().substring(0, 3)];
    if (!month) return null;
    const dayNum = parseInt(dMonMatch[1], 10);
    if (dayNum < 1 || dayNum > 31) return null;
    const day = dMonMatch[1].padStart(2, '0');
    let year = dMonMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const monDMatch = trimmed.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})\s+(\d{2,4})$/);
  if (monDMatch) {
    const month = MONTHS_MAP[monDMatch[1].toLowerCase().substring(0, 3)];
    if (!month) return null;
    const dayNum = parseInt(monDMatch[2], 10);
    if (dayNum < 1 || dayNum > 31) return null;
    const day = monDMatch[2].padStart(2, '0');
    let year = monDMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return null;
}

const MONTH_NAME_SRC = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DATE_PATTERN_SRC =
  `(?:\\d{4}\\s*[./-]\\s*\\d{2}\\s*[./-]\\s*\\d{2}|\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*\\d{2,4}|\\d{1,2}(?:\\s*|\\s*[./-]\\s*)?${MONTH_NAME_SRC}(?:\\s*|\\s*[./-]\\s*)?,?\\s*\\d{2,4}|${MONTH_NAME_SRC}\\s+\\d{1,2},?\\s+\\d{2,4})`;

const DATE_REGEX = new RegExp(`\\b${DATE_PATTERN_SRC}\\b`, 'i');
const LEADING_DATE_REGEX = new RegExp(`^(${DATE_PATTERN_SRC})(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[AP]M)?)?(?=[\\s|]|$)`, 'i');
const SINGLE_DATE_REGEX = new RegExp(`^${DATE_PATTERN_SRC}$`, 'i');

const STATEMENT_NOISE_LINE_REGEX =
  /^(?:opening\s+balance|closing\s+balance|brought\s+forward|carried\s+forward|total\s+(?:debits?|credits?|withdrawals?|deposits?)|statement\s+(?:period|from|date|summary)|account\s+(?:summary|number|statement)|page\s+\d+\s+of\s+\d+|date\s+(?:value\s+date\s+)?(?:particulars|narration|description))/i;

interface ExtractedAmountToken {
  value: number;
  raw: string;
  tag: 'DR' | 'CR' | null;
}

function resolveAmountTag(suffix?: string, sign?: string): 'DR' | 'CR' | null {
  const upper = suffix?.toUpperCase();
  if (upper === 'DR' || upper === 'D' || sign === '-') return 'DR';
  if (upper === 'CR' || upper === 'C' || sign === '+') return 'CR';
  return null;
}

function extractAmountTokens(text: string): ExtractedAmountToken[] {
  const results: ExtractedAmountToken[] = [];
  const tokenRegex =
    /(?:^|[\s|(/:\[])([+-])?\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})*\.\d{2}|\d+\.\d{2})\s*(?:\(?\s*(CR|DR|C|D)\.?\s*\)?)?(?=$|[\s|,;)\]])/gi;

  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(text)) !== null) {
    const val = parseFloat(m[2].replace(/,/g, ''));
    if (isNaN(val) || val < 0 || val >= 100000000) continue;

    results.push({
      value: val,
      raw: m[0].replace(/^[\s|(/:\[]+/, '').trim(),
      tag: resolveAmountTag(m[3], m[1]),
    });
  }

  if (results.length === 0) {
    const fallbackRegex =
      /(?:^|[\s|(/:\[])([+-])?\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+)\s*(?:\(?\s*(CR|DR|C|D)\.?\s*\)?)?(?=$|[\s|,;)\]])/gi;
    while ((m = fallbackRegex.exec(text)) !== null) {
      const val = parseFloat(m[2].replace(/,/g, ''));
      if (isNaN(val) || val <= 0 || val >= 100000000) continue;
      results.push({
        value: val,
        raw: m[0].replace(/^[\s|(/:\[]+/, '').trim(),
        tag: resolveAmountTag(m[3], m[1]),
      });
    }
  }

  return results;
}

function parseTransactionRow(rowText: string): ParsedPdfTransaction | null {
  const dateMatch = rowText.match(DATE_REGEX);
  if (!dateMatch) return null;

  const normalizedDate = normalizeDate(dateMatch[0]);
  if (!normalizedDate) return null;

  const remaining = rowText
    .replace(new RegExp(DATE_REGEX.source, 'gi'), ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\b/gi, ' ')
    .trim();

  if (STATEMENT_NOISE_LINE_REGEX.test(remaining)) {
    return null;
  }

  const amountTokens = extractAmountTokens(remaining);
  const nonZeroTokens = amountTokens.filter((t) => t.value > 0);
  if (nonZeroTokens.length === 0) return null;

  let txAmount = 0;
  let type: TransactionType = 'expense';
  let rowBalance: number | undefined;
  let txTag: 'DR' | 'CR' | null = null;

  if (amountTokens.length >= 3) {
    const debit = amountTokens[0];
    const credit = amountTokens[1];
    rowBalance = amountTokens[amountTokens.length - 1].value;

    if (credit.value > 0 && debit.value === 0) {
      txAmount = credit.value;
      type = 'income';
      txTag = credit.tag;
    } else if (debit.value > 0 && credit.value === 0) {
      txAmount = debit.value;
      type = 'expense';
      txTag = debit.tag;
    } else if (credit.value > 0 && debit.value > 0) {
      txAmount = credit.value;
      type = 'income';
      txTag = credit.tag;
    } else {
      txAmount = nonZeroTokens[0].value;
      txTag = nonZeroTokens[0].tag;
    }
  } else if (nonZeroTokens.length >= 2) {
    txAmount = nonZeroTokens[0].value;
    txTag = nonZeroTokens[0].tag;
    rowBalance = nonZeroTokens[1].value;
  } else {
    txAmount = nonZeroTokens[0].value;
    txTag = nonZeroTokens[0].tag;
  }

  if (txAmount <= 0) return null;

  let narration = remaining;
  for (const tok of amountTokens) {
    narration = narration.replace(tok.raw, ' ');
  }

  const lowerNarr = narration.toLowerCase();
  if (txTag === 'CR') {
    type = 'income';
  } else if (txTag === 'DR') {
    type = 'expense';
  } else if (
    /\b(?:cr|credit|credited|deposit|salary|refund|interest|dividend|cashback)\b/i.test(lowerNarr) ||
    lowerNarr.includes('upi/cr') ||
    lowerNarr.includes('/cr/') ||
    /\bby\s+(?:transfer|cash|clearing|clg|neft|imps|rtgs|upi)/i.test(lowerNarr)
  ) {
    type = 'income';
  } else if (
    /\b(?:dr|debit|debited|withdrawal|spent)\b/i.test(lowerNarr) ||
    lowerNarr.includes('upi/dr') ||
    lowerNarr.includes('/dr/') ||
    /\bto\s+(?:transfer|cash|clearing|neft|imps|rtgs|upi)/i.test(lowerNarr)
  ) {
    type = 'expense';
  }

  narration = narration
    .replace(/\b(cr|dr|credit|debit|neft|rtgs|upi|imps|chq|pos)\b/gi, ' ')
    .replace(/[\/\\|:_\-\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!narration) narration = 'Bank Transaction';

  const merchant = narration.split(' ').slice(0, 4).join(' ');

  return {
    date: normalizedDate,
    merchant,
    amount: txAmount,
    type,
    category: inferCategory(narration),
    note: narration,
    ...(rowBalance !== undefined ? { balance: rowBalance } : {}),
  };
}

interface ColumnarAmountCell {
  val: number;
  isCredit: boolean;
  isDebit: boolean;
}

function parseSingleColumnarCell(cell: string): ColumnarAmountCell | null | undefined {
  const trimmed = cell.trim();
  if (trimmed === '-' || trimmed === '' || trimmed === '—') {
    return null;
  }
  const m = trimmed.match(
    /^(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s*\(?\s*(CR|DR|C|D)?\.?\s*\)?$/i
  );
  if (!m) return undefined;
  const tag = resolveAmountTag(m[2]);
  if (!m[1].includes('.') && !tag) return undefined;
  const val = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(val) || val < 0 || val >= 100000000) return undefined;
  return {
    val,
    isCredit: tag === 'CR',
    isDebit: tag === 'DR',
  };
}

function parseColumnarAmountLine(line: string): Array<ColumnarAmountCell | null> | null {
  const single = parseSingleColumnarCell(line);
  if (single !== undefined) {
    return [single];
  }

  const parts = line
    .trim()
    .replace(/\(\s*(CR|DR|C|D)\.?\s*\)/gi, '$1')
    .replace(/\s+(CR|DR|C|D)\.?(?=\s|$)/gi, '$1')
    .replace(/(₹|rs\.?|inr)\s+(?=\d)/gi, '')
    .split(/\s+/);

  if (parts.length < 2 || parts.length > 4) return null;

  const parsed: Array<ColumnarAmountCell | null> = [];
  let hasNumber = false;
  for (const part of parts) {
    const cell = parseSingleColumnarCell(part);
    if (cell === undefined) return null;
    if (cell !== null) hasNumber = true;
    parsed.push(cell);
  }
  return hasNumber ? parsed : null;
}

function mergeSplitDateLines(rawLines: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const curr = rawLines[i];
    const next = i + 1 < rawLines.length ? rawLines[i + 1] : '';
    const isDayMonPrefix = /^\d{1,2}\s+[A-Za-z]{3,9}$/.test(curr);
    const isDayNumPrefix = /^\d{1,2}[./-]\d{1,2}[./-]?$/.test(curr);
    if ((isDayMonPrefix || isDayNumPrefix) && /^(?:19|20)\d{2}(?:\s|$)/.test(next)) {
      const sep = isDayNumPrefix && /[./-]$/.test(curr) ? '' : ' ';
      merged.push(`${curr}${sep}${next}`.trim());
      i++;
      continue;
    }
    merged.push(curr);
  }
  return merged;
}

const DUAL_DATE_ONLY_REGEX = new RegExp(
  `^${DATE_PATTERN_SRC}\\s+${DATE_PATTERN_SRC}$`,
  'i'
);

export function parseBankStatementPdfText(text: string): PdfParseResult {
  const transactions: ParsedPdfTransaction[] = [];
  const errors: string[] = [];

  const lines = mergeSplitDateLines(
    text
      .replace(/\u00a0/g, ' ')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  );

  // Pass 1: Single-line and multi-line wrapped rows (group continuation lines starting at a date)
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (STATEMENT_NOISE_LINE_REGEX.test(line)) {
      i++;
      continue;
    }

    if (LEADING_DATE_REGEX.test(line) && !SINGLE_DATE_REGEX.test(line) && !DUAL_DATE_ONLY_REGEX.test(line)) {
      const immediateParsed = parseTransactionRow(line);
      if (immediateParsed) {
        // Attach up to 3 pure narration continuation lines (no date, no decimal amounts)
        let extra = '';
        let k = i + 1;
        while (
          k < lines.length &&
          k <= i + 3 &&
          !DATE_REGEX.test(lines[k]) &&
          !STATEMENT_NOISE_LINE_REGEX.test(lines[k]) &&
          extractAmountTokens(lines[k]).length === 0
        ) {
          extra += ` ${lines[k]}`;
          k++;
        }
        if (extra.trim()) {
          const cleanExtra = extra.replace(/[\/\\|:_\-\t]+/g, ' ').replace(/\s+/g, ' ').trim();
          immediateParsed.note = `${immediateParsed.note} ${cleanExtra}`.trim();
        }
        transactions.push(immediateParsed);
        i = k;
        continue;
      }

      // Wrapped row: date + narration on line 1, optional value date, amounts on lines 2..8
      let merged = line;
      let matched = false;
      for (let look = 1; look <= 8 && i + look < lines.length; look++) {
        const nextLine = lines[i + look];
        if (STATEMENT_NOISE_LINE_REGEX.test(nextLine) || parseTransactionRow(nextLine) !== null) {
          break;
        }
        if (LEADING_DATE_REGEX.test(nextLine) && !(look === 1 && SINGLE_DATE_REGEX.test(nextLine))) {
          break;
        }
        merged += ` ${nextLine}`;
        const parsedWrapped = parseTransactionRow(merged);
        if (parsedWrapped) {
          transactions.push(parsedWrapped);
          i += look + 1;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    } else if (line.length >= 8 && DATE_REGEX.test(line) && !SINGLE_DATE_REGEX.test(line)) {
      const parsedMid = parseTransactionRow(line);
      if (parsedMid) {
        transactions.push(parsedMid);
      }
    }

    i++;
  }

  // Pass 2: Sequential columnar tokens (SBI/ICICI style vertical cells)
  if (transactions.length === 0) {
    let idx = 0;
    while (idx < lines.length) {
      const line = lines[idx];
      const isDualDateHeader = DUAL_DATE_ONLY_REGEX.test(line);
      if (SINGLE_DATE_REGEX.test(line) || isDualDateHeader) {
        const firstDateMatch = line.match(DATE_REGEX);
        const normalizedDate = firstDateMatch ? normalizeDate(firstDateMatch[0]) : null;
        let nextIdx = idx + 1;

        if (!isDualDateHeader && nextIdx < lines.length && SINGLE_DATE_REGEX.test(lines[nextIdx])) {
          nextIdx++;
        }

        let narration = '';
        while (nextIdx < lines.length && !SINGLE_DATE_REGEX.test(lines[nextIdx]) && !DUAL_DATE_ONLY_REGEX.test(lines[nextIdx])) {
          const token = lines[nextIdx];
          const amountCells = parseColumnarAmountLine(token);
          if (amountCells && amountCells.some((c) => c !== null)) {
            break;
          }
          if (amountCells) {
            const peek = nextIdx + 1 < lines.length ? lines[nextIdx + 1] : '';
            if (parseColumnarAmountLine(peek)) {
              break;
            }
          }
          narration += (narration ? ' ' : '') + token;
          nextIdx++;
        }

        const parsedAmounts: Array<ColumnarAmountCell | null> = [];
        while (
          nextIdx < lines.length &&
          !SINGLE_DATE_REGEX.test(lines[nextIdx]) &&
          !DUAL_DATE_ONLY_REGEX.test(lines[nextIdx]) &&
          parsedAmounts.length < 4
        ) {
          const cells = parseColumnarAmountLine(lines[nextIdx]);
          if (!cells) break;
          parsedAmounts.push(...cells);
          nextIdx++;
        }

        if (normalizedDate && parsedAmounts.length >= 1) {
          let txAmount = 0;
          let isIncome = false;
          let rowBalance: number | undefined;

          const validNumeric = parsedAmounts.filter((p): p is ColumnarAmountCell => p !== null);
          if (validNumeric.length === 1) {
            txAmount = validNumeric[0].val;
            isIncome = validNumeric[0].isCredit;
          } else if (validNumeric.length >= 2) {
            rowBalance = validNumeric[validNumeric.length - 1].val;
            txAmount = validNumeric[0].val;
            isIncome = validNumeric[0].isCredit;
          }

          if (txAmount > 0) {
            const lowerNarr = narration.toLowerCase();
            if (
              /\b(?:cr|credit|credited|deposit|salary|refund|interest|dividend|cashback)\b/i.test(lowerNarr) ||
              lowerNarr.includes('upi/cr') ||
              lowerNarr.includes('/cr/') ||
              /\bby\s+(?:transfer|tfr|cash|clearing|clg|neft|imps|rtgs|upi)/i.test(lowerNarr)
            ) {
              isIncome = true;
            } else if (
              /\b(?:dr|debit|debited|withdrawal|spent)\b/i.test(lowerNarr) ||
              lowerNarr.includes('upi/dr') ||
              lowerNarr.includes('/dr/') ||
              /\bto\s+(?:transfer|tfr|cash|clearing|clg|neft|imps|rtgs|upi)/i.test(lowerNarr)
            ) {
              isIncome = false;
            }

            const cleanNarr =
              narration.replace(/[\/\\|:_\-\t]+/g, ' ').replace(/\s+/g, ' ').trim() ||
              'Bank Transaction';
            const merchant = cleanNarr.split(' ').slice(0, 4).join(' ');

            transactions.push({
              date: normalizedDate,
              merchant,
              amount: txAmount,
              type: isIncome ? 'income' : 'expense',
              category: inferCategory(cleanNarr),
              note: cleanNarr,
              ...(rowBalance !== undefined ? { balance: rowBalance } : {}),
            });
          }
        }

        idx = nextIdx;
      } else {
        idx++;
      }
    }
  }

  let closingBalance: number | undefined;
  let statementDate: string | undefined;

  const summaryBalanceMatch = text.match(
    /(?:closing\s*bal(?:ance)?|available\s*bal(?:ance)?|clear\s*bal(?:ance)?|total\s*bal(?:ance)?|net\s*bal(?:ance)?)\s*(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (summaryBalanceMatch && summaryBalanceMatch[1]) {
    const parsed = parseFloat(summaryBalanceMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed)) closingBalance = parsed;
  }

  if (closingBalance === undefined) {
    const txsWithBalance = transactions.filter((t) => t.balance !== undefined);
    if (txsWithBalance.length > 0) {
      const sortedByDateDesc = [...txsWithBalance].sort((a, b) => b.date.localeCompare(a.date));
      closingBalance = sortedByDateDesc[0].balance;
      statementDate = sortedByDateDesc[0].date;
    }
  }

  const summaryDateMatch = text.match(
    new RegExp(`(?:statement\\s*(?:date|as\\s*on|period)|as\\s*on\\s*date)\\s*(?:is|:|-)?\\s*(${DATE_PATTERN_SRC})`, 'i')
  );
  if (summaryDateMatch && summaryDateMatch[1]) {
    statementDate = normalizeDate(summaryDateMatch[1]) || statementDate;
  }

  return {
    success: transactions.length > 0,
    isEncrypted: false,
    transactions,
    errors,
    closingBalance,
    statementDate,
  };
}

interface FontResourceMap {
  fontNameToCMap: Map<string, ParsedCMap>;
  fontsWithoutCMap: Set<string>;
}

const ADOBE_GLYPH_MAP: Record<string, string> = {
  space: ' ',
  exclam: '!',
  quotedbl: '"',
  numbersign: '#',
  dollar: '$',
  percent: '%',
  ampersand: '&',
  quotesingle: "'",
  parenleft: '(',
  parenright: ')',
  asterisk: '*',
  plus: '+',
  comma: ',',
  hyphen: '-',
  minus: '-',
  period: '.',
  slash: '/',
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  colon: ':',
  semicolon: ';',
  less: '<',
  equal: '=',
  greater: '>',
  question: '?',
  at: '@',
  bracketleft: '[',
  backslash: '\\',
  bracketright: ']',
  underscore: '_',
  braceleft: '{',
  bar: '|',
  braceright: '}',
  asciitilde: '~',
  IndianRupee: '₹',
  rupee: '₹',
};

function glyphNameToChar(name: string): string | null {
  if (ADOBE_GLYPH_MAP[name]) return ADOBE_GLYPH_MAP[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const uniMatch = name.match(/^uni([0-9A-Fa-f]{4})$/);
  if (uniMatch) {
    const code = parseInt(uniMatch[1], 16);
    return code > 0 ? String.fromCharCode(code) : null;
  }
  return null;
}

function buildDifferencesCMap(
  fontBody: string,
  objBodiesByNum: Map<number, string>
): ParsedCMap | undefined {
  let encodingBody = fontBody;
  if (!fontBody.includes('/Differences')) {
    const encRefMatch = fontBody.match(/\/Encoding\s+(\d+)\s+\d+\s+R\b/);
    if (!encRefMatch) return undefined;
    const encObj = objBodiesByNum.get(parseInt(encRefMatch[1], 10));
    if (!encObj || !encObj.includes('/Differences')) return undefined;
    encodingBody = encObj;
  }

  const diffMatch = encodingBody.match(/\/Differences\s*\[([\s\S]*?)\]/);
  if (!diffMatch) return undefined;

  const map = new Map<number, string>();
  const tokens = diffMatch[1].match(/\d+|\/[A-Za-z0-9_.\-+]+/g) || [];
  let code = 0;
  for (const tok of tokens) {
    if (tok.startsWith('/')) {
      const ch = glyphNameToChar(tok.slice(1));
      if (ch !== null) {
        map.set(code, ch);
      }
      code++;
    } else {
      const num = parseInt(tok, 10);
      if (!isNaN(num)) code = num;
    }
  }

  return map.size > 0 ? { map, codeByteWidth: 1 } : undefined;
}

function isFontDictBody(body: string): boolean {
  return (
    /\/Type\s*\/Font\b/.test(body) ||
    /\/Subtype\s*\/(?:Type1|TrueType|Type0|MMType1|Type3|CIDFontType0|CIDFontType2)\b/.test(body) ||
    /\/BaseFont\b/.test(body) ||
    /\/ToUnicode\s+\d+\s+\d+\s+R\b/.test(body)
  );
}

function collectFontResourceMappings(
  sourceText: string,
  cmapsByObjNum: Map<number, ParsedCMap>,
  streamObjects: StreamObject[]
): {
  fontNameToCMap: Map<string, ParsedCMap>;
  fontsWithoutCMap: Set<string>;
  perStreamFonts: Map<number, FontResourceMap>;
} {
  const fontNameToCMap = new Map<string, ParsedCMap>();
  const fontsWithoutCMap = new Set<string>();
  const perStreamFonts = new Map<number, FontResourceMap>();

  const objBodiesByNum = new Map<number, string>();
  const objRegex = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(sourceText)) !== null) {
    objBodiesByNum.set(parseInt(m[1], 10), m[2]);
  }

  const fontObjToCMap = new Map<number, ParsedCMap>();
  const knownFontObjs = new Set<number>();

  for (const [objNum, body] of objBodiesByNum.entries()) {
    if (isFontDictBody(body)) {
      knownFontObjs.add(objNum);
    }
    const toUniMatch = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R\b/);
    if (toUniMatch) {
      const cmap = cmapsByObjNum.get(parseInt(toUniMatch[1], 10));
      if (cmap) {
        fontObjToCMap.set(objNum, cmap);
        continue;
      }
    }
    if (knownFontObjs.has(objNum) && body.includes('/Encoding')) {
      const diffCMap = buildDifferencesCMap(body, objBodiesByNum);
      if (diffCMap) {
        fontObjToCMap.set(objNum, diffCMap);
      }
    }
  }

  const populateFontMapFromDictBody = (dictBody: string, target: FontResourceMap) => {
    const inner = stripNestedDicts(dictBody);
    const entryRegex = /\/([A-Za-z0-9_.\-+]+)\s+(\d+)\s+\d+\s+R\b/g;
    let entry: RegExpExecArray | null;
    while ((entry = entryRegex.exec(inner)) !== null) {
      const fontName = entry[1];
      const fontObjNum = parseInt(entry[2], 10);
      const cmap = fontObjToCMap.get(fontObjNum);
      if (cmap) {
        if (!target.fontNameToCMap.has(fontName)) {
          target.fontNameToCMap.set(fontName, cmap);
        }
      } else if (knownFontObjs.has(fontObjNum)) {
        target.fontsWithoutCMap.add(fontName);
      }
    }

    const inlineRegex = /\/([A-Za-z0-9_.\-+]+)\s*<</g;
    let inl: RegExpExecArray | null;
    while ((inl = inlineRegex.exec(dictBody)) !== null) {
      const fontName = inl[1];
      const extracted = extractBalancedDict(dictBody, inl.index);
      if (!extracted) continue;
      if (inlineRegex.lastIndex < extracted.dictEnd) {
        inlineRegex.lastIndex = extracted.dictEnd;
      }
      const inlineBody = extracted.dictContent;
      const toUniMatch = inlineBody.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R\b/);
      const cmap = toUniMatch ? cmapsByObjNum.get(parseInt(toUniMatch[1], 10)) : undefined;
      if (cmap) {
        target.fontNameToCMap.set(fontName, cmap);
      } else {
        const diffCMap = buildDifferencesCMap(inlineBody, objBodiesByNum);
        if (diffCMap) {
          target.fontNameToCMap.set(fontName, diffCMap);
        } else if (isFontDictBody(inlineBody)) {
          target.fontsWithoutCMap.add(fontName);
        }
      }
    }
  };

  const resolveFontMapFromResourcesDict = (resourcesBody: string): FontResourceMap | null => {
    let fontDictStr: string | null = null;
    const inlineFontIdx = resourcesBody.search(/\/Font\s*<</);
    if (inlineFontIdx !== -1) {
      fontDictStr = extractBalancedDict(resourcesBody, inlineFontIdx)?.dictContent ?? null;
    } else {
      const fontRef = resourcesBody.match(/\/Font\s+(\d+)\s+\d+\s+R\b/);
      if (fontRef) {
        const fontObjBody = objBodiesByNum.get(parseInt(fontRef[1], 10));
        if (fontObjBody) {
          fontDictStr = extractBalancedDict(fontObjBody, 0)?.dictContent ?? fontObjBody;
        }
      }
    }
    if (!fontDictStr) return null;
    const local: FontResourceMap = {
      fontNameToCMap: new Map<string, ParsedCMap>(),
      fontsWithoutCMap: new Set<string>(),
    };
    populateFontMapFromDictBody(fontDictStr, local);
    return local.fontNameToCMap.size > 0 || local.fontsWithoutCMap.size > 0 ? local : null;
  };

  const resolveResourcesOnObj = (dictBody: string, depth = 0): FontResourceMap | null => {
    if (depth > 5) return null;
    const inlineResIdx = dictBody.search(/\/Resources\s*<</);
    if (inlineResIdx !== -1) {
      const resDict = extractBalancedDict(dictBody, inlineResIdx);
      if (resDict) {
        const resolved = resolveFontMapFromResourcesDict(resDict.dictContent);
        if (resolved) return resolved;
      }
    }
    const resRef = dictBody.match(/\/Resources\s+(\d+)\s+\d+\s+R\b/);
    if (resRef) {
      const resBody = objBodiesByNum.get(parseInt(resRef[1], 10));
      if (resBody) {
        const inner = extractBalancedDict(resBody, 0)?.dictContent ?? resBody;
        const resolved = resolveFontMapFromResourcesDict(inner);
        if (resolved) return resolved;
      }
    }
    const parentRef = dictBody.match(/\/Parent\s+(\d+)\s+\d+\s+R\b/);
    if (parentRef) {
      const parentBody = objBodiesByNum.get(parseInt(parentRef[1], 10));
      if (parentBody) {
        return resolveResourcesOnObj(parentBody, depth + 1);
      }
    }
    return null;
  };

  for (const [, body] of objBodiesByNum.entries()) {
    if (!/\/Contents\b/.test(body)) continue;
    const localFonts = resolveResourcesOnObj(body);
    if (!localFonts) continue;

    const singleContent = body.match(/\/Contents\s+(\d+)\s+\d+\s+R\b/);
    if (singleContent) {
      perStreamFonts.set(parseInt(singleContent[1], 10), localFonts);
      continue;
    }
    const arrContent = body.match(/\/Contents\s*\[([\s\S]*?)\]/);
    if (arrContent) {
      const refMatches = arrContent[1].matchAll(/(\d+)\s+\d+\s+R\b/g);
      for (const ref of refMatches) {
        perStreamFonts.set(parseInt(ref[1], 10), localFonts);
      }
    }
  }

  for (const stream of streamObjects) {
    if (stream.dictContent.includes('/Resources')) {
      const localFonts = resolveResourcesOnObj(stream.dictContent);
      if (localFonts) {
        perStreamFonts.set(stream.objNum, localFonts);
      }
    }
  }

  const globalTarget: FontResourceMap = { fontNameToCMap, fontsWithoutCMap };

  const fontDictRegex = /\/Font\s*<</g;
  let fdMatch: RegExpExecArray | null;
  while ((fdMatch = fontDictRegex.exec(sourceText)) !== null) {
    const extracted = extractBalancedDict(sourceText, fdMatch.index);
    if (extracted) {
      populateFontMapFromDictBody(extracted.dictContent, globalTarget);
    }
  }

  const indirectFontDictObjs = new Set<number>();
  const indirectFontRefRegex = /\/Font\s+(\d+)\s+\d+\s+R\b/g;
  let indRef: RegExpExecArray | null;
  while ((indRef = indirectFontRefRegex.exec(sourceText)) !== null) {
    indirectFontDictObjs.add(parseInt(indRef[1], 10));
  }

  for (const objNum of indirectFontDictObjs) {
    const body = objBodiesByNum.get(objNum);
    if (!body) continue;
    const extracted = extractBalancedDict(body, 0);
    if (extracted) {
      populateFontMapFromDictBody(extracted.dictContent, globalTarget);
    }
  }

  return { fontNameToCMap, fontsWithoutCMap, perStreamFonts };
}

export async function parseBankStatementPdf(
  fileUri: string,
  options?: { password?: string }
): Promise<PdfParseResult> {
  try {
    let pdfBytes: Uint8Array;
    let rawLatin1 = '';

    try {
      const base64Content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      pdfBytes = base64ToUint8(base64Content);
      rawLatin1 = uint8ToBinary(pdfBytes);
    } catch {
      rawLatin1 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      pdfBytes = binaryToUint8(rawLatin1);
    }

    const isEncrypted = checkIsPdfEncrypted(rawLatin1);

    if (isEncrypted && !options?.password) {
      return {
        success: false,
        isEncrypted: true,
        transactions: [],
        errors: ['Password required: This PDF statement is encrypted with a password.'],
      };
    }

    let encryptionKey: Uint8Array | null = null;
    let encryptInfo: EncryptDictInfo | null = null;

    if (isEncrypted && options?.password) {
      encryptInfo = parseEncryptDictionary(rawLatin1);
      if (!encryptInfo) {
        return {
          success: false,
          isEncrypted: true,
          transactions: [],
          errors: ['Unsupported encryption format or corrupted PDF security handler.'],
        };
      }

      const candidatePasswords = Array.from(
        new Set([
          options.password,
          options.password.trim(),
          options.password.trim().toUpperCase(),
          options.password.trim().toLowerCase(),
        ])
      );

      for (let idx = 0; idx < candidatePasswords.length; idx++) {
        const key = tryUnlockPdf(candidatePasswords[idx], encryptInfo);
        if (key) {
          encryptionKey = key;
          break;
        }
      }

      if (!encryptionKey) {
        return {
          success: false,
          isEncrypted: true,
          transactions: [],
          errors: ['Incorrect password. Please verify your statement password and try again.'],
        };
      }
    }

    const isAesEncryption = encryptInfo?.isAes ?? false;
    const isV5Encryption = (encryptInfo?.v ?? 0) >= 5;
    const { streams: streamObjects, nonStreamText } = findStreamObjects(
      pdfBytes,
      rawLatin1,
      isAesEncryption
    );

    const cmapsByObjNum = new Map<number, ParsedCMap>();
    const documentCMap: ParsedCMap = { map: new Map<number, string>(), codeByteWidth: 'auto' };
    const decompressedStreams: Array<{ stream: StreamObject; text: string }> = [];
    const objStmTexts: string[] = [];
    let imageStreamCount = 0;
    let decompressFailCount = 0;
    const failedFilters = new Set<string>();

    for (let sIdx = 0; sIdx < streamObjects.length; sIdx++) {
      if (sIdx > 0 && sIdx % 25 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const stream = streamObjects[sIdx];
      const isImageStream = /\/Subtype\s*\/Image\b/.test(stream.dictContent);
      if (isImageStream) {
        imageStreamCount++;
      }

      let streamPayload = stream.streamBytes;
      const streamHasCryptIdentity =
        /\/Filter\s*\/Crypt\b/.test(stream.dictContent) &&
        /\/Name\s*\/Identity\b/.test(stream.dictContent);

      const didAttemptDecrypt =
        Boolean(encryptionKey) && !encryptInfo?.stmfIsIdentity && !streamHasCryptIdentity;
      if (didAttemptDecrypt && encryptionKey) {
        const objKey = isV5Encryption
          ? encryptionKey
          : getObjectKey(encryptionKey, stream.objNum, stream.genNum, isAesEncryption);
        streamPayload = decryptStreamData(stream.streamBytes, objKey, isAesEncryption);
      }

      let {
        bytes: decompressedBytes,
        decompressed,
      } = decompressStreamBytes(streamPayload, stream.dictContent);
      let decompressedText = uint8ToBinary(decompressedBytes);

      if (
        hasSupportedStreamFilter(stream.dictContent) &&
        (!decompressed ||
          (!decompressedText.includes('BT') &&
            !decompressedText.includes('begincmap') &&
            !stream.dictContent.includes('/ObjStm')))
      ) {
        const unenc = decompressStreamBytes(stream.streamBytes, stream.dictContent);
        if (unenc.decompressed && (unenc.bytes.length > decompressedBytes.length || !decompressed)) {
          decompressedBytes = unenc.bytes;
          decompressedText = uint8ToBinary(decompressedBytes);
          decompressed = true;
        }
      }

      if (!isImageStream && /\/Filter\b/.test(stream.dictContent) && !decompressed) {
        decompressFailCount++;
        const fMatches = stream.dictContent.match(/\/Filter\s*(?:\[([^\]]+)\]|(\/[A-Za-z0-9]+))/);
        if (fMatches) {
          const rawFilters = fMatches[1] || fMatches[2] || '';
          for (const fname of rawFilters.match(/\/[A-Za-z0-9]+/g) || []) {
            failedFilters.add(fname);
          }
        }
      }

      if (!decompressedText) {
        decompressedText = uint8ToBinary(streamPayload);
      }

      if (stream.dictContent.includes('/ObjStm')) {
        const extractedObjs = extractObjectsFromObjStm(stream.dictContent, decompressedText);
        for (const obj of extractedObjs) {
          objStmTexts.push(`${obj.objNum} 0 obj\n${obj.content}\nendobj`);
        }
      }

      if (
        stream.dictContent.includes('/CMap') ||
        decompressedText.includes('begincmap') ||
        decompressedText.includes('beginbfrange') ||
        decompressedText.includes('beginbfchar')
      ) {
        const parsedMap = parseCMap(decompressedText);
        if (parsedMap.map.size > 0) {
          cmapsByObjNum.set(stream.objNum, parsedMap);
          mergeParsedCMap(documentCMap, parsedMap);
        }
      }

      decompressedStreams.push({ stream, text: decompressedText });
    }

    const {
      fontNameToCMap: fontCMaps,
      fontsWithoutCMap,
      perStreamFonts,
    } = collectFontResourceMappings(
      `${nonStreamText}\n${objStmTexts.join('\n')}`,
      cmapsByObjNum,
      streamObjects
    );

    const textStreams = decompressedStreams.filter(({ stream, text }) => {
      if (
        stream.dictContent.includes('/ObjStm') ||
        stream.dictContent.includes('/XRef') ||
        stream.dictContent.includes('/Subtype /Image') ||
        stream.dictContent.includes('/Subtype/Image') ||
        stream.dictContent.includes('/Length1') ||
        stream.dictContent.includes('/CMap') ||
        (!text.includes('BT') && text.includes('begincmap'))
      ) {
        return false;
      }
      return text.includes('BT') || text.includes('Tj') || text.includes('TJ');
    });

    const fallbackDocCMap = documentCMap.map.size > 0 ? documentCMap : undefined;

    const extractStreamsWithOptions = (opts?: ExtractTextOptions) => {
      const coordRowsCombined: string[] = [];
      const seqLinesCombined: string[] = [];

      for (const { stream, text } of textStreams) {
        const localFonts = perStreamFonts.get(stream.objNum);
        const activeFontCMaps = localFonts
          ? localFonts.fontNameToCMap.size > 0
            ? localFonts.fontNameToCMap
            : undefined
          : fontCMaps.size > 0
            ? fontCMaps
            : undefined;
        const activeNoCMap = localFonts
          ? localFonts.fontsWithoutCMap.size > 0
            ? localFonts.fontsWithoutCMap
            : undefined
          : fontsWithoutCMap.size > 0
            ? fontsWithoutCMap
            : undefined;

        const extracted = extractTextFromStream(
          text,
          fallbackDocCMap,
          activeFontCMaps,
          activeNoCMap,
          opts
        );
        if (extracted.coordRows.length > 0) {
          coordRowsCombined.push(...extracted.coordRows);
        }
        if (extracted.seqLines.length > 0) {
          seqLinesCombined.push(...extracted.seqLines);
        }
      }

      if (coordRowsCombined.length === 0 && seqLinesCombined.length === 0) {
        const btBlocks = nonStreamText.match(/BT[\s\S]{1,200000}?ET/g);
        if (btBlocks && btBlocks.length > 0) {
          const rawExtracted = extractTextFromStream(
            btBlocks.join('\n'),
            fallbackDocCMap,
            fontCMaps.size > 0 ? fontCMaps : undefined,
            fontsWithoutCMap.size > 0 ? fontsWithoutCMap : undefined,
            opts
          );
          coordRowsCombined.push(...rawExtracted.coordRows);
          seqLinesCombined.push(...rawExtracted.seqLines);
        }
      }

      return { coordRowsCombined, seqLinesCombined };
    };

    const primary = extractStreamsWithOptions({ yTolerance: 4.5, axis: 'horizontal' });
    let parsed = parseBankStatementPdfText(primary.coordRowsCombined.join('\n'));

    if (parsed.transactions.length === 0 && primary.seqLinesCombined.length > 0) {
      parsed = parseBankStatementPdfText(primary.seqLinesCombined.join('\n'));
    }

    if (parsed.transactions.length === 0 && textStreams.length > 0) {
      const relaxed = extractStreamsWithOptions({ yTolerance: 6.5, axis: 'horizontal' });
      const relaxedParsed = parseBankStatementPdfText(relaxed.coordRowsCombined.join('\n'));
      if (relaxedParsed.transactions.length > 0) {
        parsed = relaxedParsed;
      }
    }

    if (parsed.transactions.length === 0 && textStreams.length > 0) {
      const rotated = extractStreamsWithOptions({ yTolerance: 4.5, axis: 'vertical' });
      const rotatedParsed = parseBankStatementPdfText(rotated.coordRowsCombined.join('\n'));
      if (rotatedParsed.transactions.length > 0) {
        parsed = rotatedParsed;
      }
    }

    if (parsed.transactions.length === 0) {
      const fltSuffix =
        failedFilters.size > 0 ? `, flt=${Array.from(failedFilters).join('|')}` : '';
      const diag = `diag: v=${encryptInfo?.v ?? 0}/${encryptInfo?.r ?? 0}, s=${streamObjects.length}, img=${imageStreamCount}, decFail=${decompressFailCount}, bt=${textStreams.length}, txt=${primary.coordRowsCombined.length}/${primary.seqLinesCombined.length}, cmap=${cmapsByObjNum.size}${fltSuffix}`;
      const isLikelyImagePdf =
        textStreams.length === 0 && imageStreamCount > 0 && decompressFailCount === 0;
      return {
        success: false,
        isEncrypted: isEncrypted && !encryptionKey,
        transactions: [],
        errors: [
          isEncrypted
            ? isLikelyImagePdf
              ? `PDF unlocked, but this document only contains images without selectable text. Export the original digital PDF or CSV/Excel statement instead. (${diag})`
              : `PDF unlocked, but no readable transaction rows were found. Try exporting a CSV/Excel statement or verify this PDF is not a scanned image. (${diag})`
            : isLikelyImagePdf
              ? `This PDF only contains images without selectable text. Please export the digital statement PDF or CSV/Excel file instead. (${diag})`
              : `No transactions found in this statement file. Ensure the PDF contains selectable tabular transaction entries. (${diag})`,
        ],
      };
    }

    return parsed;
  } catch (error: unknown) {
    return {
      success: false,
      isEncrypted: false,
      transactions: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse PDF statement.'],
    };
  }
}
