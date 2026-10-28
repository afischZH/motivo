/**
 * Security review M3-AP12: bypass attempts against the sanitizer. Every
 * input must be rejected or come out without active content, external
 * references or disguised documents, and stay idempotent.
 */
import { describe, expect, it } from "vitest";
import { MAX_CSS_SELECTORS } from "./css";
import { isSafeImageHref, isSafeValue } from "./policy";
import { sanitizeSvg, type SanitizeResult } from "./sanitize";

const wrap = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

function ok(result: SanitizeResult): Extract<SanitizeResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

/** Base64 payloads; only the first bytes (the file signature) matter. */
const B64 = {
  png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  jpeg: "/9j/4AAQSkZJRg==",
  gif: "R0lGODlhAQABAAAAACw=",
  webp: "UklGRgAAAABXRUJQVlA4IA==",
  svg: "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0iYWxlcnQoMSkiLz4=",
  html: "PGh0bWw+PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0PjwvaHRtbD4=",
};

/** Anything here in the output is a bypass. */
const FORBIDDEN = [
  /<script/i,
  /\son[a-z]+\s*=/i,
  /foreignObject/i,
  /javascript/i,
  /vbscript/i,
  /https?:/i,
  /\/\/evil/i,
  /<style/i,
  /\sstyle=/i,
  /xml:base/i,
  /xlink:/i,
  /<animate|<set|<a[\s>]/i,
  /<!|<\?/,
  /data:(?!image\/(?:png|jpeg|gif|webp);base64,)/i,
  /PHN2Zy|PGh0bWw/, // the SVG and HTML payloads above
];

function expectClean(input: string): void {
  const result = sanitizeSvg(input);
  if (!result.ok) return; // Rejecting is always fine.
  const body = result.svg.replace(' xmlns="http://www.w3.org/2000/svg"', "");
  for (const pattern of FORBIDDEN) expect(body, String(pattern)).not.toMatch(pattern);
  expect(sanitizeSvg(result.svg)).toMatchObject({ ok: true, svg: result.svg });
}

const BYPASSES: Record<string, string> = {
  // Encodings of javascript: (the parser decodes, the whitelist decides).
  hrefTabEntity: wrap('<a href="jav&#x09;ascript:alert(1)"><rect width="1" height="1"/></a>'),
  hrefNewlineEntity: wrap('<a href="java&#10;script:alert(1)"><rect width="1" height="1"/></a>'),
  hrefHexJ: wrap('<a xlink:href="&#x6A;avascript:alert(1)"><circle r="1"/></a>'),
  hrefLeadingSpace: wrap('<use href=" &#x20;javascript:alert(1)#a"/><rect id="a"/>'),
  useEntityHash: wrap('<rect id="a" width="1" height="1"/><use href="&#x23;a&#x3A;javascript"/>'),
  // CDATA, comments, processing instructions.
  cdataStyle: wrap(
    '<style><![CDATA[@import url(https://evil.example/a.css); .a{fill:url(https://evil.example/p#x)}]]></style><rect class="a" width="1" height="1"/>',
  ),
  cdataText: wrap('<text x="1" y="9"><![CDATA[<script>alert(1)</script>]]></text>'),
  commentSplit: wrap("<scr<!---->ipt>alert(1)</script>"),
  commentInStyle: wrap(
    '<style>.a{fill:u/**/rl(https://evil.example/x)}</style><rect class="a" width="1" height="1"/>',
  ),
  xmlStylesheetPi: `<?xml-stylesheet type="text/css" href="https://evil.example/a.css"?>${wrap('<rect width="1" height="1"/>')}`,
  piInBody: wrap('<?php echo 1 ?><rect width="1" height="1"/>'),
  externalDtd: `<!DOCTYPE svg SYSTEM "https://evil.example/x.dtd">${wrap('<rect width="1" height="1"/>')}`,
  // Case variants and namespaces.
  upperScript: wrap(
    '<SCRIPT>alert(1)</SCRIPT><Script>alert(2)</Script><rect width="1" height="1"/>',
  ),
  lowerForeignObject: wrap('<foreignobject><iframe src="https://evil.example"/></foreignobject>'),
  upperXlink: wrap('<use XLINK:HREF="https://evil.example/s.svg#a" HREF="https://evil.example"/>'),
  svgPrefixedScript: wrap(
    '<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script><rect width="1" height="1"/>',
  ),
  reboundXlink: wrap(
    '<rect id="a" width="1" height="1"/><use xmlns:x="http://www.w3.org/1999/xlink" x:href="https://evil.example/s.svg#a" href="#a"/>',
  ),
  htmlDefaultNsOnShape: wrap(
    '<rect xmlns="http://www.w3.org/1999/xhtml" width="1" height="1" onclick="x()"/><circle r="1"/>',
  ),
  mathml: wrap(
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext><script>alert(1)</script></mtext></math>',
  ),
  xmlBase: `<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://evil.example/" viewBox="0 0 10 10"><g xml:base="javascript:"><rect id="a" width="1" height="1"/><use href="#a"/></g></svg>`,
  // href and xlink:href together: only the safe one may win.
  bothHrefs: wrap(
    '<rect id="a" width="1" height="1"/><use href="#a" xlink:href="https://evil.example/s.svg#a"/>',
  ),
  bothHrefsReversed: wrap(
    '<rect id="a" width="1" height="1"/><use xlink:href="#a" href="https://evil.example/s.svg#a"/>',
  ),
  // <use> into content that the sanitizer removes.
  useIntoScript: wrap('<script id="s">alert(1)</script><use href="#s"/>'),
  useIntoForeignObject: wrap(
    '<foreignObject id="f"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject><use href="#f"/>',
  ),
  useIntoUnsafeId: wrap('<rect id="a b" width="1" height="1"/><use href="#a b"/>'),
  // Animation of references.
  setXlinkHref: wrap(
    '<rect id="a" width="1" height="1"/><use href="#a"><set attributeName="xlink:href" to="https://evil.example/s.svg#a"/><animate attributeName="href" values="javascript:alert(1)"/></use>',
  ),
  animateTransformOnbegin: wrap(
    '<rect width="1" height="1"><animateTransform attributeName="transform" begin="click" onbegin="alert(1)"/></rect>',
  ),
  // Disguised documents in embedded images.
  pngThatIsSvg: wrap(`<image href="data:image/png;base64,${B64.svg}" width="1" height="1"/>`),
  jpegThatIsHtml: wrap(`<image href="data:image/jpeg;base64,${B64.html}" width="1" height="1"/>`),
  svgDataUtf8: wrap(
    '<image href="data:image/svg+xml;utf8,&lt;svg onload=alert(1)&gt;" width="1" height="1"/>',
  ),
  dataWithParams: wrap(
    `<image href="data:image/png;charset=utf-8;base64,${B64.png}" width="1" height="1"/>`,
  ),
  feImageData: wrap(
    `<filter id="f"><feImage href="data:image/png;base64,${B64.png}"/></filter><rect filter="url(#f)" width="1" height="1"/>`,
  ),
  // url() in mask, filter, clip-path, markers, in every spelling.
  maskExternal: wrap('<rect width="1" height="1" mask="url(https://evil.example/m.svg#m)"/>'),
  clipPathEntity: wrap(
    '<rect width="1" height="1" clip-path="url(&#x68;ttps://evil.example/c#c)"/>',
  ),
  markerProtocolRelative: wrap('<path d="M0 0L1 1" marker-end="url(//evil.example/m#m)"/>'),
  urlCssEscape: wrap('<rect width="1" height="1" style="fill:u\\72l(https://evil.example/x)"/>'),
  urlUppercase: wrap('<rect width="1" height="1" fill="URL(https://evil.example/x#a)"/>'),
  urlSpaced: wrap('<rect width="1" height="1" filter="url (https://evil.example/f#f)"/>'),
  urlQuotedHash: wrap(
    '<rect width="1" height="1" fill="url(&quot;#a&quot;) url(&quot;https://evil.example&quot;)"/>',
  ),
  urlTwoLocalsOneRemote: wrap(
    '<rect width="1" height="1" fill="url(#a) url(#b) url(https://evil.example/x)"/>',
  ),
  imageSetInStyle: wrap(
    '<style>rect{fill:image-set("https://evil.example/x.png" 1x)}</style><rect width="1" height="1"/>',
  ),
  customPropertyInStyle: wrap(
    '<rect width="1" height="1" style="fill:var(--x);--x:url(https://evil.example)"/>',
  ),
  // Attribute value quirks.
  fontFamilyQuoteBreak: wrap(
    '<text font-family="x&quot; onload=&quot;alert(1)" x="1" y="1">t</text>',
  ),
  styleQuoteBreak: wrap(
    '<style>.a{font-family:"x\\" onload=alert(1) y"}</style><text class="a" x="1" y="1">t</text>',
  ),
  transformInjection: wrap(
    '<rect width="1" height="1" transform="translate(1) url(https://evil.example)"/>',
  ),
  idInjection: wrap('<rect id="a&quot; onload=&quot;alert(1)" width="1" height="1"/>'),
  noSpaceBetweenAttrs: wrap('<rect width="1"onload="alert(1)" height="1"/>'),
  unquotedAttr: wrap("<rect width=1 onload=alert(1)/>"),
  backtickAttr: wrap("<rect width=`1` onload=`alert(1)`/>"),
  nullByte: wrap('<rect width="1" height="1" fill="#000&#0;"/>'),
};

describe("sanitizeSvg: bypass attempts (security review)", () => {
  it.each(Object.entries(BYPASSES))("%s", (_, input) => {
    expectClean(input);
  });

  it("keeps only the safe reference when href and xlink:href disagree", () => {
    expect(ok(sanitizeSvg(BYPASSES.bothHrefs ?? "")).svg).toContain('<use href="#a"/>');
    expect(ok(sanitizeSvg(BYPASSES.bothHrefsReversed ?? "")).svg).not.toContain("<use");
  });

  it("drops uses whose target the sanitizer removed", () => {
    expect(ok(sanitizeSvg(BYPASSES.useIntoScript ?? "")).svg).not.toContain("<use");
    expect(ok(sanitizeSvg(BYPASSES.useIntoForeignObject ?? "")).svg).not.toContain("<use");
  });

  it("keeps markup-looking text as escaped text", () => {
    const out = ok(sanitizeSvg(BYPASSES.cdataText ?? "")).svg;
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("isSafeImageHref: magic bytes of embedded images", () => {
  it("accepts raster data whose bytes match the declared type", () => {
    expect(isSafeImageHref(`data:image/png;base64,${B64.png}`)).toBe(true);
    expect(isSafeImageHref(`data:image/jpeg;base64,${B64.jpeg}`)).toBe(true);
    expect(isSafeImageHref(`data:image/gif;base64,${B64.gif}`)).toBe(true);
    expect(isSafeImageHref(`data:image/webp;base64,${B64.webp}`)).toBe(true);
    const wrapped = `${B64.png.slice(0, 8)}\n ${B64.png.slice(8)}`;
    expect(isSafeImageHref(`data:image/png;base64,${wrapped}`)).toBe(true);
  });

  it("rejects SVG or HTML disguised as a raster type, and mismatched types", () => {
    expect(isSafeImageHref(`data:image/png;base64,${B64.svg}`)).toBe(false);
    expect(isSafeImageHref(`data:image/jpeg;base64,${B64.html}`)).toBe(false);
    expect(isSafeImageHref(`data:image/webp;base64,${B64.png}`)).toBe(false);
    expect(isSafeImageHref(`data:image/gif;base64,${B64.jpeg}`)).toBe(false);
    expect(isSafeImageHref("data:image/png;base64,")).toBe(false);
    expect(isSafeImageHref(`data:image/svg+xml;base64,${B64.svg}`)).toBe(false);
  });
});

describe("sanitizeSvg: denial of service (security review)", () => {
  // Wall-clock time is the point of these tests (generous bounds, the
  // vulnerable versions took seconds); the sanitizer itself never reads it.
  // The package compiles without DOM or Node types, hence the cast.
  const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
  const now = (): number => clock.now();
  const timed = (input: string): { ms: number; result: SanitizeResult } => {
    const start = now();
    const result = sanitizeSvg(input);
    return { ms: now() - start, result };
  };

  it("checks function names in linear time (no regex backtracking)", () => {
    // About 2.4 s with the old `/([a-z-]*)\s*\(/g` scan.
    const input = wrap(`<rect fill="${"a".repeat(4000)}"/>`.repeat(200));
    expect(timed(input).ms).toBeLessThan(1500);
    expect(isSafeValue("fill", "a".repeat(4000))).toBe(true);
    expect(isSafeValue("fill", `rgb(1,2,3) ${"a".repeat(100)}(`)).toBe(false);
    expect(isSafeValue("transform", "rotate (45) scale(2)")).toBe(true);
  });

  it("bounds CSS matching for many selectors times many elements", () => {
    // About 45 s before the selector cap and the rule index.
    const dupes = wrap(
      `<style>${".a,".repeat(100_000)}.a{fill:red}</style>${"<g/>".repeat(19_000)}`,
    );
    expect(timed(dupes).ms).toBeLessThan(3000);
    const sameKey = Array.from({ length: 3000 }, (_, i) => `.a.b${i}`).join(",");
    const shared = wrap(`<style>${sameKey}{fill:red}</style>${'<g class="a b1"/>'.repeat(19_000)}`);
    const { ms, result } = timed(shared);
    expect(ms).toBeLessThan(3000);
    expect(result.ok).toBe(true);
  });

  it("caps the number of selectors taken from stylesheets", () => {
    const rules = Array.from({ length: MAX_CSS_SELECTORS }, (_, i) => `.c${i}{fill:#111}`).join("");
    const late = wrap(
      `<style>${rules}.late{fill:#222}</style><rect class="late" width="1" height="1"/>`,
    );
    expect(ok(sanitizeSvg(late)).svg).not.toContain("#222");
    const normal = wrap(
      '<style>.st0{fill:#e63946}</style><rect class="st0" width="1" height="1"/>',
    );
    expect(ok(sanitizeSvg(normal)).svg).toContain('fill="#e63946"');
  });

  it("removes thousands of invalid uses without quadratic splicing", () => {
    const input = wrap(`<rect id="r"/>${'<use href="#r"/>'.repeat(19_990)}`);
    const { ms, result } = timed(input);
    expect(ms).toBeLessThan(2000);
    expect(ok(result).svg.match(/<use /g)?.length).toBe(2000);
  });

  it("treats an unclosed CSS comment as running to the end", () => {
    const input = wrap(
      `<style>.a{fill:#123456} /* ${"/*".repeat(50_000)}</style><rect class="a" width="1" height="1"/>`,
    );
    expect(ok(sanitizeSvg(input)).svg).toContain('fill="#123456"');
  });
});
