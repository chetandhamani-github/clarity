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

/**
 * Standard 32-byte padding string specified in PDF Reference ISO 32000-1 (Section 7.6.3.3)
 */
const PASSWORD_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/**
 * Checks if a PDF buffer/content contains an /Encrypt dictionary.
 */
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

/**
 * Converts a Base64 string into a Uint8Array.
 */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_MAP = new Int8Array(256).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_MAP[B64_CHARS.charCodeAt(i)] = i;
}

/**
 * Converts a Base64 string into a Uint8Array safely in all JS engines, stripping whitespace/newlines.
 */
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

/**
 * Converts a Uint8Array to a binary string (latin1/raw characters) safely in all JS engines (including Hermes).
 */
function uint8ToBinary(u8: Uint8Array): string {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    const slice = u8.subarray(i, Math.min(i + chunk, u8.length));
    str += String.fromCharCode.apply(null, Array.from(slice));
  }
  return str;
}

/**
 * Converts a binary string (latin1) to Uint8Array.
 */
function binaryToUint8(bin: string): Uint8Array {
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    u8[i] = bin.charCodeAt(i);
  }
  return u8;
}

/**
 * RC4 encryption / decryption (symmetric stream cipher).
 */
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

/**
 * Decodes a hex string to Uint8Array.
 */
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
 * Unescapes PDF literal string escapes.
 */
function decodePdfLiteral(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\\r?\n/g, '')
    .replace(/\0/g, '');
}

/**
 * Parses a /ToUnicode CMap stream and returns a mapping from CID/glyph code to Unicode character string.
 */
function parseCMap(cmapStr: string): Map<number, string> {
  const map = new Map<number, string>();

  // Parse beginbfchar ... endbfchar
  const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let charMatch: RegExpExecArray | null;
  while ((charMatch = bfCharRegex.exec(cmapStr)) !== null) {
    const tokens = charMatch[1].trim().match(/<[0-9a-fA-F]+>/g) || [];
    for (let i = 0; i < tokens.length - 1; i += 2) {
      const srcCode = parseInt(tokens[i].replace(/[<>]/g, ''), 16);
      const dstHex = tokens[i + 1].replace(/[<>]/g, '');
      let dstStr = '';
      for (let k = 0; k < dstHex.length; k += 4) {
        const charCode = parseInt(dstHex.substring(k, Math.min(k + 4, dstHex.length)), 16);
        if (!isNaN(charCode) && charCode > 0) dstStr += String.fromCharCode(charCode);
      }
      if (dstStr) map.set(srcCode, dstStr);
    }
  }

  // Parse beginbfrange ... endbfrange
  const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = bfRangeRegex.exec(cmapStr)) !== null) {
    const tokens = rangeMatch[1].trim().match(/(?:<[0-9a-fA-F]+>|\[[\s\S]*?\])/g) || [];
    let i = 0;
    while (i < tokens.length) {
      const startTok = tokens[i++];
      const endTok = tokens[i++];
      const dstTok = tokens[i++];
      if (!startTok || !endTok || !dstTok) break;

      const startCode = parseInt(startTok.replace(/[<>]/g, ''), 16);
      const endCode = parseInt(endTok.replace(/[<>]/g, ''), 16);

      if (dstTok.startsWith('[')) {
        const destHexes = dstTok.replace(/[\[\]]/g, '').trim().match(/<[0-9a-fA-F]+>/g) || [];
        for (let code = startCode; code <= endCode && code - startCode < destHexes.length; code++) {
          const dHex = destHexes[code - startCode].replace(/[<>]/g, '');
          let dstStr = '';
          for (let k = 0; k < dHex.length; k += 4) {
            const charCode = parseInt(dHex.substring(k, Math.min(k + 4, dHex.length)), 16);
            if (!isNaN(charCode) && charCode > 0) dstStr += String.fromCharCode(charCode);
          }
          if (dstStr) map.set(code, dstStr);
        }
      } else {
        const dstStart = parseInt(dstTok.replace(/[<>]/g, ''), 16);
        for (let code = startCode; code <= endCode; code++) {
          const charCode = dstStart + (code - startCode);
          map.set(code, String.fromCharCode(charCode));
        }
      }
    }
  }

  return map;
}

/**
 * Decodes PDF hex string `<48656c6c6f>`, with /ToUnicode CMap translation and UTF-16BE support.
 */
function decodePdfHex(hex: string, cmap?: Map<number, string>): string {
  let clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) clean += '0';

  // If a CMap is available, translate CIDs
  if (cmap && cmap.size > 0) {
    // Try 2-byte (4 hex chars) CID lookup
    if (clean.length >= 4 && clean.length % 4 === 0) {
      let out = '';
      let mappedCount = 0;
      for (let i = 0; i < clean.length; i += 4) {
        const cid = parseInt(clean.substring(i, i + 4), 16);
        if (cmap.has(cid)) {
          out += cmap.get(cid);
          mappedCount++;
        } else {
          out += String.fromCharCode(cid);
        }
      }
      if (mappedCount > 0) {
        return out.replace(/\0/g, '');
      }
    }

    // Try 1-byte (2 hex chars) CID lookup
    if (clean.length >= 2 && clean.length % 2 === 0) {
      let out = '';
      let mappedCount = 0;
      for (let i = 0; i < clean.length; i += 2) {
        const cid = parseInt(clean.substring(i, i + 2), 16);
        if (cmap.has(cid)) {
          out += cmap.get(cid);
          mappedCount++;
        } else {
          out += String.fromCharCode(cid);
        }
      }
      if (mappedCount > 0) {
        return out.replace(/\0/g, '');
      }
    }
  }

  let out = '';
  if (clean.toUpperCase().startsWith('FEFF')) {
    for (let i = 4; i < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.substring(i, i + 4), 16));
    }
  } else if (clean.length >= 4 && clean.length % 4 === 0 && clean.startsWith('00')) {
    for (let i = 0; i < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.substring(i, i + 4), 16));
    }
  } else {
    for (let i = 0; i < clean.length; i += 2) {
      out += String.fromCharCode(parseInt(clean.substring(i, i + 2), 16));
    }
  }
  return out.replace(/\0/g, '');
}

/**
 * Safely parses a literal string `( ... )` from PDF stream, handling balanced parens and escapes.
 */
function parsePdfLiteralString(str: string, startIdx: number): { text: string; nextIdx: number } {
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
        return { text: decodePdfLiteral(raw), nextIdx: i + 1 };
      }
      raw += c;
    } else {
      raw += c;
    }
    i++;
  }
  return { text: decodePdfLiteral(raw), nextIdx: i };
}

/**
 * Parses a `[...] TJ` array operator, preserving word spacing from kerning offsets and decoding with CMap.
 */
function parseTjArray(
  str: string,
  startIdx: number,
  cmap?: Map<number, string>
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
      const parsed = parsePdfLiteralString(str, i);
      result += parsed.text;
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
      const numMatch = str.substring(i).match(/^([-\d.]+)/);
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
  id1: Uint8Array;
  isAes: boolean;
  encryptMetadataFalse: boolean;
}

/**
 * Safely extracts a balanced PDF dictionary << ... >> starting at or after startFromIndex.
 */
function extractBalancedDict(
  raw: string,
  startFromIndex: number
): { dictContent: string; dictEnd: number } | null {
  const dictStart = raw.indexOf('<<', startFromIndex);
  if (dictStart === -1) return null;

  let depth = 0;
  let dictEnd = -1;
  let i = dictStart;
  let inString = false;
  let strDepth = 0;

  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1];

    if (!inString) {
      if (c === '(') {
        inString = true;
        strDepth = 1;
      } else if (c === '<' && next === '<') {
        depth++;
        i++;
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
 * Parses the PDF /Encrypt dictionary from the raw document bytes.
 * Supports both standard flat dictionaries and modern nested crypt filters (/CF << /StdCF << ... >> >>).
 */
function parseEncryptDictionary(rawLatin1: string): EncryptDictInfo | null {
  let encryptDictStr = '';

  const encryptRefMatch = rawLatin1.match(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
  if (encryptRefMatch) {
    const objNum = encryptRefMatch[1];
    const genNum = encryptRefMatch[2];
    const objRegex = new RegExp(`\\b${objNum}\\s+${genNum}\\s+obj\\b`);
    const objMatch = rawLatin1.match(objRegex);
    if (objMatch && objMatch.index !== undefined) {
      const extracted = extractBalancedDict(rawLatin1, objMatch.index);
      if (extracted) {
        encryptDictStr = extracted.dictContent;
      }
    }
  }

  if (!encryptDictStr) {
    const inlineIdx = rawLatin1.indexOf('/Encrypt');
    if (inlineIdx !== -1) {
      const extracted = extractBalancedDict(rawLatin1, inlineIdx);
      if (extracted) {
        encryptDictStr = extracted.dictContent;
      }
    }
  }

  if (!encryptDictStr) return null;

  const vMatch = encryptDictStr.match(/\/V\s+(\d+)/);
  const rMatch = encryptDictStr.match(/\/R\s+(\d+)/);
  const lenMatch = encryptDictStr.match(/\/Length\s+(\d+)/);
  const pMatch = encryptDictStr.match(/\/P\s+(-?\d+)/);

  // /O and /U may be hex strings <...> or literal strings (...)
  let o: Uint8Array | null = null;
  const oHex = encryptDictStr.match(/\/O\s*<([0-9a-fA-F]+)>/);
  if (oHex) {
    o = hexToBytes(oHex[1]);
  } else {
    const oLitIdx = encryptDictStr.indexOf('/O');
    if (oLitIdx !== -1) {
      const parenIdx = encryptDictStr.indexOf('(', oLitIdx);
      if (parenIdx !== -1 && parenIdx - oLitIdx < 10) {
        const parsed = parsePdfLiteralString(encryptDictStr, parenIdx);
        o = binaryToUint8(parsed.text);
      }
    }
  }

  let u: Uint8Array | null = null;
  const uHex = encryptDictStr.match(/\/U\s*<([0-9a-fA-F]+)>/);
  if (uHex) {
    u = hexToBytes(uHex[1]);
  } else {
    const uLitIdx = encryptDictStr.indexOf('/U');
    if (uLitIdx !== -1) {
      const parenIdx = encryptDictStr.indexOf('(', uLitIdx);
      if (parenIdx !== -1 && parenIdx - uLitIdx < 10) {
        const parsed = parsePdfLiteralString(encryptDictStr, parenIdx);
        u = binaryToUint8(parsed.text);
      }
    }
  }

  if (!o || !u) return null;

  const v = vMatch ? parseInt(vMatch[1], 10) : 1;
  const r = rMatch ? parseInt(rMatch[1], 10) : 2;
  const length = lenMatch ? parseInt(lenMatch[1], 10) : (v === 1 ? 40 : 128);
  const p = pMatch ? parseInt(pMatch[1], 10) : -12;

  // Extract ID1 from document trailer
  let id1: Uint8Array = hexToBytes('');
  const idMatch = rawLatin1.match(/\/ID\s*\[\s*<([0-9a-fA-F]+)>/);
  if (idMatch) {
    id1 = hexToBytes(idMatch[1]);
  } else {
    const idLitMatch = rawLatin1.match(/\/ID\s*\[\s*\(/);
    if (idLitMatch && idLitMatch.index !== undefined) {
      const parenIdx = rawLatin1.indexOf('(', idLitMatch.index);
      if (parenIdx !== -1) {
        const parsed = parsePdfLiteralString(rawLatin1, parenIdx);
        id1 = binaryToUint8(parsed.text);
      }
    }
  }

  const isAes =
    encryptDictStr.includes('/AESV2') ||
    encryptDictStr.includes('/AESV3') ||
    encryptDictStr.includes('/AES') ||
    encryptDictStr.includes('/CFM /AESV2') ||
    encryptDictStr.includes('/CFM /AESV3') ||
    (encryptDictStr.includes('/V 4') && !encryptDictStr.includes('/CFM /V2'));

  const encryptMetadataFalse = encryptDictStr.includes('/EncryptMetadata false');

  return {
    v,
    r,
    length,
    p,
    o,
    u,
    id1,
    isAes,
    encryptMetadataFalse,
  };
}

/**
 * Derives the PDF encryption key using ISO 32000-1 Algorithm 3.2.
 */
function deriveEncryptionKey(
  password: string,
  encryptInfo: EncryptDictInfo
): Uint8Array {
  const { r, length, p, o, id1, encryptMetadataFalse } = encryptInfo;
  const keyLengthBytes = Math.floor(length / 8);

  const pwdBytes = new Uint8Array(
    Array.from(password).map((c) => c.charCodeAt(0) & 0xff)
  );
  const padded = new Uint8Array(32);
  padded.set(pwdBytes.slice(0, 32));
  if (pwdBytes.length < 32) {
    padded.set(PASSWORD_PADDING.slice(0, 32 - pwdBytes.length), pwdBytes.length);
  }

  const md5 = forge.md.md5.create();
  md5.update(uint8ToBinary(padded));
  md5.update(uint8ToBinary(o));

  // P as 4 bytes little-endian
  const pBytes = new Uint8Array(4);
  const pUnsigned = p >>> 0;
  pBytes[0] = pUnsigned & 0xff;
  pBytes[1] = (pUnsigned >> 8) & 0xff;
  pBytes[2] = (pUnsigned >> 16) & 0xff;
  pBytes[3] = (pUnsigned >> 24) & 0xff;
  md5.update(uint8ToBinary(pBytes));

  md5.update(uint8ToBinary(id1));

  // ISO 32000-1 Algorithm 3.2 Step f: if EncryptMetadata is false, append 4 bytes of 0xFF
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

/**
 * Validates the user password using ISO 32000-1 Algorithm 3.6.
 */
function verifyUserPassword(
  encKey: Uint8Array,
  encryptInfo: EncryptDictInfo
): boolean {
  const { r, u, id1 } = encryptInfo;

  if (r === 2) {
    const test = rc4(encKey, PASSWORD_PADDING);
    for (let i = 0; i < 32; i++) {
      if (test[i] !== u[i]) return false;
    }
    return true;
  }

  // R >= 3
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

/**
 * Derives an object-specific key: MD5(encryptionKey + obj_num 3B LE + gen_num 2B LE [+ 'sAlT']).
 */
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

/**
 * Decrypts a stream with RC4 or AES-CBC.
 */
function decryptStreamData(
  streamBytes: Uint8Array,
  objKey: Uint8Array,
  isAes: boolean
): Uint8Array {
  if (isAes) {
    if (streamBytes.length <= 16) return streamBytes;
    const iv = streamBytes.subarray(0, 16);
    const ciphertext = streamBytes.subarray(16);
    try {
      const decipher = forge.cipher.createDecipher('AES-CBC', uint8ToBinary(objKey));
      decipher.start({ iv: uint8ToBinary(iv) });
      decipher.update(forge.util.createBuffer(uint8ToBinary(ciphertext)));
      const ok = decipher.finish();
      if (ok) {
        return binaryToUint8(decipher.output.getBytes());
      }
    } catch {
      // Fallback if AES decryption fails
    }
    return streamBytes;
  }

  // RC4 stream decryption
  return rc4(objKey, streamBytes);
}

/**
 * Decompresses stream data if FlateDecode is present.
 */
function decompressStreamBytes(data: Uint8Array, isFlate: boolean): Uint8Array {
  if (!isFlate) return data;
  try {
    return pako.inflate(data);
  } catch {
    try {
      return pako.inflateRaw(data);
    } catch {
      return data;
    }
  }
}

interface StreamObject {
  objNum: number;
  genNum: number;
  dictContent: string;
  streamBytes: Uint8Array;
}

/**
 * Scans and extracts all stream objects from the PDF document safely,
 * properly tracking nested dictionary delimiters `<<` and `>>` and indirect `/Length` references.
 */
function findStreamObjects(
  pdfBytes: Uint8Array,
  rawLatin1: string
): StreamObject[] {
  const streams: StreamObject[] = [];
  const objRegex = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(rawLatin1)) !== null) {
    const objNum = parseInt(match[1], 10);
    const genNum = parseInt(match[2], 10);
    let afterObjIdx = match.index + match[0].length;

    // Skip whitespace
    while (afterObjIdx < rawLatin1.length && /\s/.test(rawLatin1[afterObjIdx])) {
      afterObjIdx++;
    }

    // Must start with "<<"
    if (rawLatin1.substring(afterObjIdx, afterObjIdx + 2) !== '<<') {
      continue;
    }

    let depth = 0;
    let dictEnd = -1;
    let i = afterObjIdx;
    let inString = false;
    let strDepth = 0;

    while (i < rawLatin1.length) {
      const c = rawLatin1[i];
      const next = rawLatin1[i + 1];

      if (!inString) {
        if (c === '(') {
          inString = true;
          strDepth = 1;
        } else if (c === '<' && next === '<') {
          depth++;
          i++;
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

    if (dictEnd === -1) continue;

    const dictContent = rawLatin1.substring(afterObjIdx + 2, dictEnd - 2);
    const afterDict = rawLatin1.substring(dictEnd, dictEnd + 40);
    const streamMatch = afterDict.match(/^\s*stream(?:\r\n|\n|\r)/);
    if (!streamMatch) {
      continue;
    }

    const streamStartIndex = dictEnd + streamMatch[0].length;

    // Length resolution: check for indirect (/Length 38 0 R) or direct integer
    let streamLength = -1;
    const indMatch = dictContent.match(/\/Length\s+(\d+)\s+(\d+)\s+R\b/);
    if (indMatch) {
      const lenObjNum = indMatch[1];
      const lenGenNum = indMatch[2];
      const lenRegex = new RegExp(`\\b${lenObjNum}\\s+${lenGenNum}\\s+obj\\s*(\\d+)`);
      const lenM = rawLatin1.match(lenRegex);
      if (lenM) streamLength = parseInt(lenM[1], 10);
    } else {
      const dirMatch = dictContent.match(/\/Length\s+(\d+)(?:[^\d]|$)/);
      if (dirMatch) streamLength = parseInt(dirMatch[1], 10);
    }

    let streamEndIndex = -1;
    if (streamLength >= 0 && streamStartIndex + streamLength <= pdfBytes.length) {
      streamEndIndex = streamStartIndex + streamLength;
    } else {
      const endstreamPos = rawLatin1.indexOf('endstream', streamStartIndex);
      if (endstreamPos > streamStartIndex) {
        let actual = endstreamPos;
        if (actual > streamStartIndex && (rawLatin1[actual - 1] === '\n' || rawLatin1[actual - 1] === '\r')) actual--;
        if (actual > streamStartIndex && rawLatin1[actual - 1] === '\r') actual--;
        streamEndIndex = actual;
      }
    }

    if (streamEndIndex > streamStartIndex) {
      streams.push({
        objNum,
        genNum,
        dictContent,
        streamBytes: pdfBytes.subarray(streamStartIndex, streamEndIndex),
      });
      // Move search past stream to avoid false object matches inside binary payload
      objRegex.lastIndex = streamEndIndex;
    }
  }

  return streams;
}

export interface ExtractedStreamContent {
  coordRows: string[];
  seqLines: string[];
}

/**
 * Extracts readable text lines from decompressed PDF stream content:
 * - coordRows: Text fragments reconstructed into complete horizontal rows by matching Y coordinates (tolerance ±3.5pt) and sorting by X.
 * - seqLines: Sequential text lines emitted upon line break operators (T*, Td, TD, Tm, ', ").
 */
function extractTextFromStream(
  streamStr: string,
  cmap?: Map<number, string>
): ExtractedStreamContent {
  const coordFragments: Array<{ x: number; y: number; text: string }> = [];
  const seqLines: string[] = [];
  let currentSeqLine = '';

  const btRegex = /BT[\s\S]*?ET/g;
  let btMatch: RegExpExecArray | null;

  const opRegex =
    /(?:\[([\s\S]*?)\]\s*TJ|\(([\s\S]*?)\)\s*(?:Tj|['"])|<([0-9a-fA-F\s]+)>\s*(?:Tj|['"])|T\*|((?:-?\d+(?:\.\d+)?\s+){1,6}(?:Td|TD|Tm)))/g;

  while ((btMatch = btRegex.exec(streamStr)) !== null) {
    const block = btMatch[0];
    let curX = 0;
    let curY = 0;
    let lineStartX = 0;
    let lineStartY = 0;
    let opMatch: RegExpExecArray | null;

    while ((opMatch = opRegex.exec(block)) !== null) {
      const fullOp = opMatch[0];
      if (opMatch[4]) {
        // Transformation operator
        const parts = opMatch[4].trim().split(/\s+/);
        const op = parts[parts.length - 1];
        const nums = parts.slice(0, parts.length - 1).map(Number);

        if (op === 'Tm' && nums.length >= 6) {
          curX = nums[4];
          curY = nums[5];
          lineStartX = curX;
          lineStartY = curY;
        } else if ((op === 'Td' || op === 'TD') && nums.length >= 2) {
          lineStartX += nums[0];
          lineStartY += nums[1];
          curX = lineStartX;
          curY = lineStartY;
        }

        if (currentSeqLine.trim()) {
          seqLines.push(currentSeqLine.trim());
          currentSeqLine = '';
        }
      } else if (fullOp === 'T*') {
        lineStartY -= 12;
        curX = lineStartX;
        curY = lineStartY;
        if (currentSeqLine.trim()) {
          seqLines.push(currentSeqLine.trim());
          currentSeqLine = '';
        }
      } else if (opMatch[1] !== undefined) {
        // [...] TJ array
        const parsedTj = parseTjArray(block, opMatch.index, cmap);
        const text = parsedTj.text.trim();
        if (text) {
          coordFragments.push({ x: curX, y: curY, text });
          currentSeqLine += (currentSeqLine ? ' ' : '') + text;
        }
      } else if (opMatch[2] !== undefined) {
        // (...) Tj or (...) ' or (...) "
        const text = decodePdfLiteral(opMatch[2]).trim();
        if (text) {
          coordFragments.push({ x: curX, y: curY, text });
          currentSeqLine += (currentSeqLine ? ' ' : '') + text;
        }
        if (fullOp.endsWith("'") || fullOp.endsWith('"')) {
          if (currentSeqLine.trim()) {
            seqLines.push(currentSeqLine.trim());
            currentSeqLine = '';
          }
        }
      } else if (opMatch[3] !== undefined) {
        // <hex> Tj or <hex> ' or <hex> "
        const text = decodePdfHex(opMatch[3], cmap).trim();
        if (text) {
          coordFragments.push({ x: curX, y: curY, text });
          currentSeqLine += (currentSeqLine ? ' ' : '') + text;
        }
        if (fullOp.endsWith("'") || fullOp.endsWith('"')) {
          if (currentSeqLine.trim()) {
            seqLines.push(currentSeqLine.trim());
            currentSeqLine = '';
          }
        }
      }
    }
    if (currentSeqLine.trim()) {
      seqLines.push(currentSeqLine.trim());
      currentSeqLine = '';
    }
  }

  // Group fragments by Y (top-to-bottom) and sort by X (left-to-right)
  const coordRows: string[] = [];
  if (coordFragments.length > 0) {
    coordFragments.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3.5) return b.y - a.y;
      return a.x - b.x;
    });

    let group: Array<{ x: number; y: number; text: string }> = [];
    let curY: number | null = null;
    for (const f of coordFragments) {
      if (curY === null || Math.abs(f.y - curY) > 3.5) {
        if (group.length > 0) {
          coordRows.push(group.map((g) => g.text).join(' '));
        }
        group = [f];
        curY = f.y;
      } else {
        group.push(f);
      }
    }
    if (group.length > 0) {
      coordRows.push(group.map((g) => g.text).join(' '));
    }
  }

  return { coordRows, seqLines };
}

/**
 * Infers category from narration text.
 */
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

/**
 * Standardizes DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD into YYYY-MM-DD.
 */
function normalizeDate(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  // Match DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Match DD Mon YYYY or DD-Mon-YYYY or DD-Mon-YY (e.g. 15 Oct 2024, 15-Oct-24)
  const monMatch = trimmed.match(/^(\d{1,2})[ -]([a-zA-Z]{3,9})[ -](\d{2,4})$/);
  if (monMatch) {
    const day = monMatch[1].padStart(2, '0');
    const months: Record<string, string> = {
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
    const month = months[monMatch[2].toLowerCase().substring(0, 3)] || '01';
    let year = monMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return null;
}

const DATE_REGEX =
  /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b)/i;
const SINGLE_DATE_REGEX =
  /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]\d{2,4}|\d{4}-\d{2}-\d{2})$/i;

/**
 * Parses raw text content extracted from a bank statement PDF.
 */
export function parseBankStatementPdfText(text: string): PdfParseResult {
  const transactions: ParsedPdfTransaction[] = [];
  const errors: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Pass 1: Single-line transactions (date, narration, and amount on the same line)
  for (const line of lines) {
    if (line.length < 8) continue;

    const dateMatch = line.match(DATE_REGEX);
    if (!dateMatch) continue;

    const rawDate = dateMatch[0];
    const normalizedDate = normalizeDate(rawDate);
    if (!normalizedDate) continue;

    // Remove dates (including secondary Value Date if present) from the line to parse amounts and narration
    const remaining = line.replace(new RegExp(DATE_REGEX.source, 'gi'), ' ').trim();

    // Prefer standard financial amounts with decimal points (.XX) to avoid confusing transaction IDs/phone numbers as amounts
    let decimalMatches = remaining.match(/\b(\d{1,3}(?:,\d{2,3})*\.\d{2}|\d+\.\d{2})\b/g);
    if (!decimalMatches || decimalMatches.length === 0) {
      decimalMatches = remaining.match(/\b(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\b/g);
    }
    if (!decimalMatches || decimalMatches.length < 1) continue;

    const parsedNums = decimalMatches
      .map((a) => parseFloat(a.replace(/,/g, '')))
      .filter((n) => !isNaN(n) && n >= 0 && n < 100000000);

    const nonZeroNums = parsedNums.filter((n) => n > 0);
    if (nonZeroNums.length === 0) continue;

    let txAmount = 0;
    let type: TransactionType = 'expense';
    let rowBalance: number | undefined;

    // Case A: 3 amounts on row (Debit, Credit, Balance) - typical SBI / Indian bank format
    if (parsedNums.length >= 3) {
      const debit = parsedNums[0];
      const credit = parsedNums[1];
      rowBalance = parsedNums[2];

      if (credit > 0 && debit === 0) {
        txAmount = credit;
        type = 'income';
      } else if (debit > 0 && credit === 0) {
        txAmount = debit;
        type = 'expense';
      } else if (credit > 0) {
        txAmount = credit;
        type = 'income';
      } else {
        txAmount = debit > 0 ? debit : nonZeroNums[0];
      }
    } else if (nonZeroNums.length >= 2) {
      // Case B: 2 amounts on row (Amount, Balance)
      txAmount = nonZeroNums[0];
      rowBalance = nonZeroNums[1];
    } else {
      // Case C: Single amount on row
      txAmount = nonZeroNums[0];
    }

    if (txAmount <= 0) continue;

    const lower = remaining.toLowerCase();
    if (
      lower.includes(' cr') ||
      lower.includes('credit') ||
      lower.includes('deposit') ||
      lower.includes('salary') ||
      lower.includes('refund') ||
      lower.includes('interest') ||
      lower.includes('dividend') ||
      lower.includes('cashback') ||
      lower.includes('upi/cr') ||
      lower.includes('/cr/') ||
      lower.includes('cr.') ||
      /\bby\b/i.test(remaining)
    ) {
      type = 'income';
    } else if (
      lower.includes('dr.') ||
      lower.includes('/dr/') ||
      lower.includes('upi/dr') ||
      /\bto\b/i.test(remaining)
    ) {
      type = 'expense';
    }

    let narration = remaining;
    for (const amt of decimalMatches) {
      narration = narration.replace(amt, ' ');
    }
    narration = narration
      .replace(/\b(cr|dr|credit|debit|neft|rtgs|upi|imps|chq|pos)\b/gi, ' ')
      .replace(/[\/\\|:_\-\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!narration) narration = 'Bank Transaction';

    const merchantParts = narration.split(' ');
    const merchant = merchantParts.slice(0, 4).join(' ');

    transactions.push({
      date: normalizedDate,
      merchant,
      amount: txAmount,
      type,
      category: inferCategory(narration),
      note: narration,
      ...(rowBalance !== undefined ? { balance: rowBalance } : {}),
    });
  }

  // Pass 2: Sequential columnar tokens (common in Indian bank tables such as SBI & ICICI)
  if (transactions.length === 0) {
    const cellAmountPattern = /^(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)\s*(CR|DR)?$/i;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (SINGLE_DATE_REGEX.test(line)) {
        const rawDate = line;
        const normalizedDate = normalizeDate(rawDate);
        let nextIdx = i + 1;

        // Skip optional second date (Value Date)
        if (nextIdx < lines.length && SINGLE_DATE_REGEX.test(lines[nextIdx])) {
          nextIdx++;
        }

        // Collect description tokens until amount or next date
        let narration = '';
        while (nextIdx < lines.length && !SINGLE_DATE_REGEX.test(lines[nextIdx])) {
          const token = lines[nextIdx];
          if (
            cellAmountPattern.test(token) &&
            (token.includes('.') ||
              token.toUpperCase().includes('CR') ||
              token.toUpperCase().includes('DR'))
          ) {
            break;
          }
          if (token === '-' || token === '') {
            const peek = nextIdx + 1 < lines.length ? lines[nextIdx + 1] : '';
            if (cellAmountPattern.test(peek) && (peek.includes('.') || peek === '-')) {
              break;
            }
          }
          narration += (narration ? ' ' : '') + token;
          nextIdx++;
        }

        // Collect numeric debit/credit/balance cells
        const parsedAmounts: Array<{ val: number; isCredit: boolean; isDebit: boolean } | null> =
          [];
        while (
          nextIdx < lines.length &&
          !SINGLE_DATE_REGEX.test(lines[nextIdx]) &&
          parsedAmounts.length < 4
        ) {
          const item = lines[nextIdx];
          if (item === '-' || item === '') {
            parsedAmounts.push(null);
          } else {
            const m = item.match(cellAmountPattern);
            if (m && (m[1].includes('.') || m[2])) {
              const val = parseFloat(m[1].replace(/,/g, ''));
              const isCredit = (m[2] || '').toUpperCase() === 'CR';
              const isDebit = (m[2] || '').toUpperCase() === 'DR';
              parsedAmounts.push({ val, isCredit, isDebit });
            } else {
              break;
            }
          }
          nextIdx++;
        }

        if (normalizedDate && parsedAmounts.length >= 1) {
          let txAmount = 0;
          let isIncome = false;
          let rowBalance: number | undefined;

          const validNumeric = parsedAmounts.filter(
            (p): p is { val: number; isCredit: boolean; isDebit: boolean } => p !== null
          );
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
              lowerNarr.includes('credit') ||
              lowerNarr.includes('interest') ||
              lowerNarr.includes('salary') ||
              lowerNarr.includes('deposit') ||
              lowerNarr.includes('refund') ||
              lowerNarr.includes('by ') ||
              lowerNarr.includes('upi/cr')
            ) {
              isIncome = true;
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

        i = nextIdx;
      } else {
        i++;
      }
    }
  }

  // Extract closing balance: check for summary pattern in document text
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
    /(?:statement\s*(?:date|as\s*on|period)|as\s*on\s*date)\s*(?:is|:|-)?\s*(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}[ -][a-zA-Z]{3}[ -]\d{2,4}\b)/i
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

/**
 * Main entry point for reading, unlocking, and parsing a Bank Statement PDF file.
 */
export async function parseBankStatementPdf(
  fileUri: string,
  options?: { password?: string }
): Promise<PdfParseResult> {
  try {
    // Read the PDF as Base64 for 100% binary safety
    let pdfBytes: Uint8Array;
    let rawLatin1 = '';

    try {
      const base64Content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      pdfBytes = base64ToUint8(base64Content);
      rawLatin1 = uint8ToBinary(pdfBytes);
    } catch {
      // Fallback to UTF-8 string read if base64 read fails
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
    let isAesEncryption = false;

    if (isEncrypted && options?.password) {
      const encryptInfo = parseEncryptDictionary(rawLatin1);
      if (!encryptInfo) {
        return {
          success: false,
          isEncrypted: true,
          transactions: [],
          errors: ['Unsupported encryption format or corrupted PDF security handler.'],
        };
      }

      isAesEncryption = encryptInfo.isAes;
      const candidatePasswords = [
        options.password,
        options.password.trim(),
        options.password.trim().toUpperCase(),
        options.password.trim().toLowerCase(),
      ];

      for (const pwd of candidatePasswords) {
        const derived = deriveEncryptionKey(pwd, encryptInfo);
        if (verifyUserPassword(derived, encryptInfo)) {
          encryptionKey = derived;
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

    // Extract all stream objects using balanced dictionary nesting and indirect length resolution
    const streamObjects = findStreamObjects(pdfBytes, rawLatin1);
    const coordRowsCombined: string[] = [];
    const seqLinesCombined: string[] = [];

    const documentCMap = new Map<number, string>();
    const decompressedStreams: Array<{ stream: StreamObject; text: string }> = [];

    // Pass 1: Decrypt and decompress all streams; harvest all /ToUnicode CMaps
    for (const stream of streamObjects) {
      let streamPayload = stream.streamBytes;
      if (encryptionKey) {
        const objKey = getObjectKey(encryptionKey, stream.objNum, stream.genNum, isAesEncryption);
        streamPayload = decryptStreamData(stream.streamBytes, objKey, isAesEncryption);
      }

      const isFlate = stream.dictContent.includes('/FlateDecode');
      let decompressedBytes = decompressStreamBytes(streamPayload, isFlate);
      let decompressedText = uint8ToBinary(decompressedBytes);

      // Fallback: If decryption or decompression failed, try uncompressed/unencrypted stream
      if (
        isFlate &&
        (!decompressedText ||
          decompressedBytes === streamPayload ||
          (!decompressedText.includes('BT') && !decompressedText.includes('begincmap')))
      ) {
        const unencBytes = decompressStreamBytes(stream.streamBytes, true);
        if (unencBytes !== stream.streamBytes) {
          decompressedText = uint8ToBinary(unencBytes);
        }
      }

      if (!decompressedText) {
        decompressedText = uint8ToBinary(streamPayload);
      }

      // If stream contains a /ToUnicode CMap, harvest CID mappings
      if (
        stream.dictContent.includes('/CMap') ||
        decompressedText.includes('begincmap') ||
        decompressedText.includes('beginbfrange')
      ) {
        const parsedMap = parseCMap(decompressedText);
        for (const [code, char] of parsedMap.entries()) {
          documentCMap.set(code, char);
        }
      }

      decompressedStreams.push({ stream, text: decompressedText });
    }

    // Pass 2: Extract text from content streams using the harvested document CMap
    for (const { text } of decompressedStreams) {
      const extracted = extractTextFromStream(text, documentCMap);
      if (extracted.coordRows.length > 0) {
        coordRowsCombined.push(...extracted.coordRows);
      }
      if (extracted.seqLines.length > 0) {
        seqLinesCombined.push(...extracted.seqLines);
      }
    }

    // Fallback: Also check raw document for uncompressed text blocks
    if (coordRowsCombined.length === 0 && seqLinesCombined.length === 0) {
      const rawExtracted = extractTextFromStream(rawLatin1, documentCMap);
      coordRowsCombined.push(...rawExtracted.coordRows);
      seqLinesCombined.push(...rawExtracted.seqLines);
    }

    // Try parsing coordinate-reconstructed rows first (preserves complete horizontal table rows)
    let parsed = parseBankStatementPdfText(coordRowsCombined.join('\n'));

    // If no transactions found, fallback to sequential lines (emitted upon line break operators)
    if (parsed.transactions.length === 0 && seqLinesCombined.length > 0) {
      parsed = parseBankStatementPdfText(seqLinesCombined.join('\n'));
    }

    if (parsed.transactions.length === 0) {
      return {
        success: false,
        isEncrypted: isEncrypted && !encryptionKey,
        transactions: [],
        errors: [
          isEncrypted
            ? 'Unable to locate transactions in this encrypted statement. Please verify that this is a valid account statement.'
            : 'No transactions found in this statement file. Ensure the PDF contains tabular transaction entries.',
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
