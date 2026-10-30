/**
 * A small syntax highlighter for code screenshots: one list of sticky
 * regular expressions per language, tried in order at each position. Not a
 * parser; it colours the usual suspects (comments, strings, numbers,
 * keywords, function names, tags) well enough for a picture.
 */

export const CODE_LANGUAGES = [
  "javascript",
  "typescript",
  "css",
  "html",
  "python",
  "json",
  "bash",
  "plain",
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const TOKEN_KINDS = [
  "plain",
  "comment",
  "string",
  "number",
  "keyword",
  "function",
  "type",
  "tag",
  "attribute",
  "punctuation",
] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

type Rule = readonly [TokenKind, RegExp];

const words = (list: string) => new RegExp(`\\b(?:${list.split(" ").join("|")})\\b`, "y");

const JS_KEYWORDS =
  "abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield";

const C_STYLE: readonly Rule[] = [
  ["comment", /\/\/[^\n]*/y],
  ["comment", /\/\*[\s\S]*?(?:\*\/|$)/y],
  ["string", /`(?:\\[\s\S]|[^`\\])*`?/y],
  ["string", /"(?:\\.|[^"\\\n])*"?/y],
  ["string", /'(?:\\.|[^'\\\n])*'?/y],
  ["number", /\b(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?)\b/iy],
  ["keyword", words(JS_KEYWORDS)],
  ["type", /\b[A-Z][A-Za-z0-9_]*\b/y],
  ["function", /\b[a-zA-Z_$][\w$]*(?=\s*\()/y],
  ["punctuation", /[{}()[\];,.<>=+\-*/%!&|^~?:]+/y],
];

const RULES: Record<CodeLanguage, readonly Rule[]> = {
  javascript: C_STYLE,
  typescript: C_STYLE,
  css: [
    ["comment", /\/\*[\s\S]*?(?:\*\/|$)/y],
    ["string", /"(?:\\.|[^"\\\n])*"?/y],
    ["string", /'(?:\\.|[^'\\\n])*'?/y],
    ["keyword", /@[\w-]+/y],
    ["attribute", /[\w-]+(?=\s*:(?!:))/y],
    ["number", /#[\da-f]{3,8}\b|-?\d*\.?\d+(?:%|[a-z]+)?/iy],
    ["function", /[\w-]+(?=\()/y],
    ["tag", /[.#]?[a-zA-Z][\w-]*/y],
    ["punctuation", /[{}()[\];:,>+~*=]+/y],
  ],
  html: [
    ["comment", /<!--[\s\S]*?(?:-->|$)/y],
    ["tag", /<\/?[a-zA-Z][\w:-]*|\/?>/y],
    ["attribute", /[a-zA-Z_:][\w:.-]*(?==)/y],
    ["string", /"[^"]*"?|'[^']*'?/y],
    ["punctuation", /=/y],
  ],
  python: [
    ["comment", /#[^\n]*/y],
    ["string", /(?:[rbfu]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/iy],
    ["string", /(?:[rbfu]{1,2})?(?:"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/iy],
    ["number", /\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?j?\b/iy],
    [
      "keyword",
      words(
        "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield",
      ),
    ],
    ["function", /\b[a-zA-Z_]\w*(?=\s*\()/y],
    ["type", /\b[A-Z]\w*\b/y],
    ["punctuation", /[{}()[\];,.:=+\-*/%<>!&|^~@]+/y],
  ],
  json: [
    ["attribute", /"(?:\\.|[^"\\\n])*"(?=\s*:)/y],
    ["string", /"(?:\\.|[^"\\\n])*"?/y],
    ["number", /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/iy],
    ["keyword", /\b(?:true|false|null)\b/y],
    ["punctuation", /[{}[\],:]/y],
  ],
  bash: [
    ["comment", /#[^\n]*/y],
    ["string", /"(?:\\.|[^"\\])*"?|'[^']*'?/y],
    ["attribute", /\$\{?[\w@#?*!$-]+\}?/y],
    [
      "keyword",
      words(
        "if then else elif fi for in do done while until case esac function return export local",
      ),
    ],
    ["function", /(?<=^|[\n|;&]\s*)[a-zA-Z_][\w.-]*/y],
    ["number", /\b\d+\b/y],
    ["punctuation", /[|&;<>()[\]{}=]+/y],
  ],
  plain: [],
};

/** Splits code into coloured tokens; plain runs are merged. */
export function tokenize(code: string, language: CodeLanguage): Token[] {
  const rules = RULES[language];
  const out: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") {
      out[out.length - 1] = { kind, text: last.text + text };
    } else out.push({ kind, text });
  };
  let i = 0;
  outer: while (i < code.length) {
    for (const [kind, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length > 0) {
        push(kind, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    // Skip a whole word or a single character as plain text.
    const word = /[A-Za-z0-9_$]+|[\s\S]/y;
    word.lastIndex = i;
    const m = word.exec(code) as RegExpExecArray;
    push("plain", m[0]);
    i += m[0].length;
  }
  return out;
}

/** Tokens split into lines (multi-line comments and strings are cut at line breaks). */
export function tokenLines(tokens: readonly Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== "") (lines[lines.length - 1] as Token[]).push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
