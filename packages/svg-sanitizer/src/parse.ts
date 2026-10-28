/**
 * A small, strict XML parser for SVG files. It builds a plain tree and
 * refuses anything it does not fully understand instead of guessing:
 *
 * - a DOCTYPE with an internal subset (entity declarations, XXE, "billion
 *   laughs") is rejected; a plain DOCTYPE (Illustrator) is skipped;
 * - only the five predefined XML entities and numeric character references
 *   are decoded, any other `&name;` rejects the document;
 * - tags must nest and attributes must be quoted and unique.
 *
 * No DOM, no regex backtracking on the document as a whole: one pass over the
 * string, so it runs in workers and on the server (Cloudflare Workers).
 */

export interface XmlElement {
  type: "element";
  name: string;
  attrs: Map<string, string>;
  children: XmlNode[];
}

export interface XmlText {
  type: "text";
  value: string;
}

export type XmlNode = XmlElement | XmlText;

export type ParseError =
  "malformed" | "doctype" | "entity" | "too-deep" | "too-many-elements" | "no-root";

export class XmlParseError extends Error {
  constructor(readonly code: ParseError) {
    super(code);
    this.name = "XmlParseError";
  }
}

export interface ParseLimits {
  /** Deepest allowed nesting of elements. */
  maxDepth: number;
  /** Most elements in the whole document. */
  maxElements: number;
}

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9_:.]/;
const SPACE = /[ \t\r\n]/;

const PREDEFINED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Largest valid code point, excluding the surrogate range and XML-forbidden controls. */
function validCodePoint(cp: number): boolean {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false;
  if (cp < 0x20 && cp !== 0x9 && cp !== 0xa && cp !== 0xd) return false;
  return true;
}

/** Decodes character and predefined entity references. Throws on anything else. */
export function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf("&", i);
    if (amp === -1) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, amp);
    const semi = raw.indexOf(";", amp);
    if (semi === -1 || semi - amp > 12) throw new XmlParseError("entity");
    const ref = raw.slice(amp + 1, semi);
    let decoded: string | undefined;
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const hex = ref.slice(2);
      if (/^[0-9a-fA-F]{1,6}$/.test(hex)) {
        const cp = Number.parseInt(hex, 16);
        if (validCodePoint(cp)) decoded = String.fromCodePoint(cp);
      }
    } else if (ref.startsWith("#")) {
      const dec = ref.slice(1);
      if (/^[0-9]{1,7}$/.test(dec)) {
        const cp = Number.parseInt(dec, 10);
        if (validCodePoint(cp)) decoded = String.fromCodePoint(cp);
      }
    } else {
      decoded = Object.prototype.hasOwnProperty.call(PREDEFINED, ref) ? PREDEFINED[ref] : undefined;
    }
    if (decoded === undefined) throw new XmlParseError("entity");
    out += decoded;
    i = semi + 1;
  }
  return out;
}

/**
 * Parses an XML document into its root element. Throws `XmlParseError`.
 * Comments and processing instructions are skipped; CDATA becomes text.
 */
export function parseXml(source: string, limits: ParseLimits): XmlElement {
  const src = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const n = src.length;
  let i = 0;
  let root: XmlElement | null = null;
  const stack: XmlElement[] = [];
  let elements = 0;

  const fail = (code: ParseError = "malformed"): never => {
    throw new XmlParseError(code);
  };

  const readName = (): string => {
    const start = i;
    if (i >= n || !NAME_START.test(src.charAt(i))) fail();
    i++;
    while (i < n && NAME_CHAR.test(src.charAt(i))) i++;
    return src.slice(start, i);
  };

  const skipSpace = (): void => {
    while (i < n && SPACE.test(src.charAt(i))) i++;
  };

  const appendText = (value: string): void => {
    const parent = stack[stack.length - 1];
    if (!parent) {
      // Only whitespace may surround the root element.
      if (value.trim() !== "") fail();
      return;
    }
    const last = parent.children[parent.children.length - 1];
    if (last?.type === "text") last.value += value;
    else parent.children.push({ type: "text", value });
  };

  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      appendText(decodeEntities(src.slice(i)));
      break;
    }
    if (lt > i) appendText(decodeEntities(src.slice(i, lt)));
    i = lt;

    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end === -1) fail();
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end === -1) fail();
      if (stack.length === 0) fail();
      appendText(src.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (src.startsWith("<!", i)) {
      // Only a DOCTYPE before the root, and only without an internal subset.
      if (!/^<!DOCTYPE[ \t\r\n]/i.test(src.slice(i, i + 10)) || root !== null) fail("doctype");
      const end = src.indexOf(">", i);
      if (end === -1) fail();
      const decl = src.slice(i, end);
      if (decl.includes("[") || decl.includes("<", 1)) fail("doctype");
      i = end + 1;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      if (end === -1) fail();
      i = end + 2;
      continue;
    }
    if (src.startsWith("</", i)) {
      i += 2;
      const name = readName();
      skipSpace();
      if (src.charAt(i) !== ">") fail();
      i++;
      const open = stack.pop();
      if (!open || open.name !== name) fail();
      continue;
    }

    // Start tag.
    i++;
    const name = readName();
    if (stack.length === 0 && root !== null) fail(); // a second root
    if (stack.length >= limits.maxDepth) fail("too-deep");
    if (++elements > limits.maxElements) fail("too-many-elements");
    const element: XmlElement = { type: "element", name, attrs: new Map(), children: [] };
    for (;;) {
      const before = i;
      skipSpace();
      const ch = src.charAt(i);
      if (ch === "/" && src.charAt(i + 1) === ">") {
        i += 2;
        break;
      }
      if (ch === ">") {
        i++;
        stack.push(element);
        break;
      }
      // Attributes must be separated by whitespace.
      if (i === before) fail();
      const attr = readName();
      skipSpace();
      if (src.charAt(i) !== "=") fail();
      i++;
      skipSpace();
      const quote = src.charAt(i);
      if (quote !== '"' && quote !== "'") fail();
      const end = src.indexOf(quote, i + 1);
      if (end === -1) fail();
      const raw = src.slice(i + 1, end);
      if (raw.includes("<")) fail();
      if (element.attrs.has(attr)) fail();
      // Attribute value normalisation (XML 1.0, 3.3.3): whitespace characters become spaces.
      element.attrs.set(attr, decodeEntities(raw).replace(/[\t\r\n]/g, " "));
      i = end + 1;
    }
    const parent = stack[stack.length - (stack[stack.length - 1] === element ? 2 : 1)];
    if (parent) parent.children.push(element);
    else root = element;
  }

  if (stack.length > 0) fail();
  if (!root) fail("no-root");
  return root as unknown as XmlElement;
}
