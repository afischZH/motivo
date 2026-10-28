import { describe, expect, it } from "vitest";
import { decodeEntities, parseXml, XmlParseError } from "./parse";
import { isSafeValue } from "./policy";
import {
  SVG_MAX_DEPTH,
  SVG_MAX_ELEMENTS,
  SVG_MAX_USES,
  sanitizeSvg,
  sanitizeSvgCached,
  type SanitizeResult,
} from "./sanitize";

const wrap = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

function ok(result: SanitizeResult): Extract<SanitizeResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

function clean(input: string): string {
  return ok(sanitizeSvg(input)).svg;
}

/** Things that must never survive, in any spelling. */
const FORBIDDEN = [
  /<script/i,
  /\son[a-z]+\s*=/i,
  /foreignObject/i,
  /javascript:/i,
  /vbscript:/i,
  /https?:/i,
  /<style/i,
  /\sstyle=/i,
  /<!ENTITY/i,
  /<!DOCTYPE/i,
  /data:image\/svg/i,
  /data:text/i,
  /<animate/i,
  /<set/i,
  /<iframe/i,
  /expression\(/i,
  /@import/i,
];

function expectSafe(svg: string) {
  const body = svg.replace(' xmlns="http://www.w3.org/2000/svg"', "");
  for (const pattern of FORBIDDEN) expect(body, String(pattern)).not.toMatch(pattern);
}

/**
 * Hostile corpus: well-known SVG XSS and resource-loading payloads. Each must
 * either be rejected or come out without any active or external content.
 */
const HOSTILE: Record<string, string> = {
  script: wrap('<script>alert(1)</script><circle cx="50" cy="50" r="40"/>'),
  scriptCdata: wrap("<script><![CDATA[alert(1)]]></script><rect width='10' height='10'/>"),
  scriptXlink: wrap('<script xlink:href="https://evil.example/x.js"/><rect width="1" height="1"/>'),
  onload:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="1" height="1"/></svg>',
  onclickUpper: wrap('<rect width="5" height="5" ONCLICK="alert(1)" onMouseOver="x()"/>'),
  foreignObject: wrap(
    '<foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"/></body></foreignObject><circle r="4"/>',
  ),
  xlinkHttp: wrap(
    '<image xlink:href="http://evil.example/pixel.png" width="10" height="10"/><rect width="1" height="1"/>',
  ),
  hrefJavascript: wrap('<a href="javascript:alert(1)"><rect width="10" height="10"/></a>'),
  xlinkJavascript: wrap(
    '<a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="&#106;avascript:alert(1)"><circle r="3"/></a>',
  ),
  useExternal: wrap(
    '<use href="https://evil.example/sprite.svg#icon"/><rect width="1" height="1"/>',
  ),
  useDataUri: wrap(
    '<use href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+#x"/><rect width="1" height="1"/>',
  ),
  cssUrl: wrap(
    '<style>.a{fill:url(https://evil.example/x.svg#g)} @import url(https://evil.example/a.css);</style><rect class="a" width="10" height="10"/>',
  ),
  styleAttrUrl: wrap(
    '<rect width="10" height="10" style="fill:url(http://evil.example/p.svg#a);background:url(x)"/>',
  ),
  styleExpression: wrap('<rect width="10" height="10" style="fill:expression(alert(1))"/>'),
  fillUrlExternal: wrap('<rect width="10" height="10" fill="url(https://evil.example/x.svg#p)"/>'),
  filterUrlExternal: wrap('<rect width="10" height="10" filter="url(//evil.example/f.svg#f)"/>'),
  feImage: wrap(
    '<filter id="f"><feImage href="https://evil.example/x.png"/></filter><rect width="10" height="10" filter="url(#f)"/>',
  ),
  animateHref: wrap(
    '<a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(2)"/><text x="1" y="9">click</text></a>',
  ),
  imageSvgDataUri: wrap(
    '<image href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0iYWxlcnQoMSkiLz4=" width="10" height="10"/><rect width="1" height="1"/>',
  ),
  imageHtmlDataUri: wrap(
    '<image href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;" width="10" height="10"/><rect width="1" height="1"/>',
  ),
  iframe: wrap('<iframe src="https://evil.example"/><rect width="1" height="1"/>'),
  htmlNamespace: wrap(
    '<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script><rect width="1" height="1"/>',
  ),
  defaultNamespaceSwitch: wrap(
    '<g xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></g><rect width="1" height="1"/>',
  ),
};

describe("sanitizeSvg: hostile corpus", () => {
  it.each(Object.entries(HOSTILE))(
    "%s comes out without active or external content",
    (_, input) => {
      const result = sanitizeSvg(input);
      if (!result.ok) return; // Rejecting is always fine.
      expectSafe(result.svg);
      expect(sanitizeSvg(result.svg)).toMatchObject({ ok: true, svg: result.svg });
    },
  );

  it("counts what it removed", () => {
    expect(ok(sanitizeSvg(HOSTILE.script ?? "")).removed).toBeGreaterThan(0);
    expect(ok(sanitizeSvg(HOSTILE.onload ?? "")).removed).toBeGreaterThan(0);
    expect(ok(sanitizeSvg(wrap('<circle r="4"/>'))).removed).toBe(0);
  });

  it("drops images that are not embedded raster data", () => {
    expect(clean(HOSTILE.xlinkHttp ?? "")).not.toContain("<image");
    expect(clean(HOSTILE.imageSvgDataUri ?? "")).not.toContain("<image");
  });

  it("keeps embedded raster images as data URIs", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const out = clean(wrap(`<image xlink:href="${png}" width="10" height="10"/>`));
    expect(out).toContain(`<image height="10" href="${png}" width="10"/>`);
  });

  it("unwraps links into groups without the href", () => {
    const out = clean(HOSTILE.hrefJavascript ?? "");
    expect(out).toContain("<g><rect");
    expect(out).not.toContain("href");
  });
});

describe("sanitizeSvg: entities and DOCTYPE", () => {
  it("rejects internal DTD subsets (XXE, billion laughs)", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${wrap("<text>&xxe;</text>")}`;
    const laughs = `<!DOCTYPE svg [<!ENTITY a "lol"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>${wrap("<text>&b;</text>")}`;
    expect(sanitizeSvg(xxe)).toEqual({ ok: false, error: "doctype" });
    expect(sanitizeSvg(laughs)).toEqual({ ok: false, error: "doctype" });
  });

  it("accepts the plain DOCTYPE written by design tools", () => {
    const input = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${wrap('<rect width="4" height="4"/>')}`;
    const out = clean(input);
    expect(out).not.toMatch(/DOCTYPE|w3\.org\/Graphics/);
    expect(out).toContain("<rect");
  });

  it("rejects undefined entities but decodes predefined and numeric ones", () => {
    expect(sanitizeSvg(wrap("<text>&nbsp;</text>"))).toEqual({ ok: false, error: "entity" });
    expect(decodeEntities("a &amp; &lt;b&gt; &#65;&#x42; &quot;&apos;")).toBe("a & <b> AB \"'");
    expect(() => decodeEntities("&#0;")).toThrow(XmlParseError);
    expect(() => decodeEntities("&#xD800;")).toThrow(XmlParseError);
  });

  it("re-escapes decoded text, so markup in text stays text", () => {
    const out = clean(wrap('<text x="0" y="10">&lt;script&gt;alert(1)&lt;/script&gt;</text>'));
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script");
  });
});

describe("sanitizeSvg: use references", () => {
  it("keeps a local use of a plain shape", () => {
    const out = clean(wrap('<defs><circle id="c" r="4"/></defs><use href="#c" x="10"/>'));
    expect(out).toContain('<use href="#c" x="10"/>');
  });

  it("drops nested uses (exponential blow-up) and self references", () => {
    const nested = wrap(
      '<g id="a"><circle r="1"/></g><g id="b"><use href="#a"/><use href="#a"/></g><g id="c"><use href="#b"/><use href="#b"/></g><use href="#c"/>',
    );
    const out = clean(nested);
    expect(out.match(/<use /g)?.length).toBe(2); // only the two uses of #a
    const self = clean(wrap('<g id="s"><use href="#s"/><rect width="1" height="1"/></g>'));
    expect(self).not.toContain("<use");
  });

  it("drops uses of missing targets and caps their number", () => {
    expect(clean(wrap('<use href="#missing"/><rect width="1" height="1"/>'))).not.toContain("<use");
    const many = wrap(
      `<rect id="r" width="1" height="1"/>${'<use href="#r"/>'.repeat(SVG_MAX_USES + 5)}`,
    );
    expect(clean(many).match(/<use /g)?.length).toBe(SVG_MAX_USES);
  });
});

describe("sanitizeSvg: structure and limits", () => {
  it("rejects malformed markup", () => {
    for (const bad of [
      "<svg><g></svg>",
      "<svg width=10></svg>",
      '<svg a="1" a="2"></svg>',
      "<svg></svg><svg></svg>",
      "not svg",
      "",
    ]) {
      expect(sanitizeSvg(bad).ok, bad).toBe(false);
    }
  });

  it("rejects non-SVG roots and foreign root namespaces", () => {
    expect(sanitizeSvg("<html><body/></html>")).toEqual({ ok: false, error: "not-svg" });
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/1999/xhtml" width="1" height="1"/>')).toEqual(
      {
        ok: false,
        error: "not-svg",
      },
    );
  });

  it("rejects documents that are too large, too deep or too big", () => {
    expect(sanitizeSvg(wrap("x".repeat(100)), { maxLength: 50 })).toEqual({
      ok: false,
      error: "too-large",
    });
    const deep = wrap("<g>".repeat(SVG_MAX_DEPTH + 1) + "</g>".repeat(SVG_MAX_DEPTH + 1));
    expect(sanitizeSvg(deep)).toEqual({ ok: false, error: "too-deep" });
    const wide = wrap("<rect/>".repeat(SVG_MAX_ELEMENTS + 1));
    expect(sanitizeSvg(wide)).toEqual({ ok: false, error: "too-many-elements" });
  });

  it("needs a size: viewBox or numeric width and height", () => {
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toEqual({
      ok: false,
      error: "no-size",
    });
    const sized = ok(
      sanitizeSvg('<svg width="24px" height="12"><rect width="1" height="1"/></svg>'),
    );
    expect(
      sized.svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12" width="24" height="12"',
      ),
    ).toBe(true);
  });

  it("normalises the root to its viewBox size", () => {
    const out = ok(
      sanitizeSvg(
        wrap(
          '<rect width="1" height="1"/>',
          'width="100%" height="5cm" viewBox="10,20,30,40" x="5"',
        ),
      ),
    );
    expect(out).toMatchObject({
      width: 30,
      height: 40,
      viewBox: { x: 10, y: 20, width: 30, height: 40 },
    });
    expect(out.svg).not.toContain('x="5"');
  });

  it("drops editor metadata without counting it as removed", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="x" viewBox="0 0 10 10" inkscape:version="1" data-name="Layer"><title>Logo</title><desc>d</desc><metadata><rdf/></metadata><sodipodi:namedview/><path d="M0 0L10 10" inkscape:label="p"/></svg>`;
    const out = ok(sanitizeSvg(input));
    expect(out.removed).toBe(0);
    expect(out.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><path d="M0 0L10 10"/></svg>',
    );
  });

  it("is idempotent", () => {
    const input = wrap(
      '<style>.a{fill:#f00;stroke:blue}</style><g class="a" transform="rotate(45 50 50)"><path d="M10 10h20v20z" style="stroke-width:2"/></g><text x="1" y="2" font-family="\'Inter\', sans-serif">Hi &amp; bye</text>',
    );
    const once = clean(input);
    expect(clean(once)).toBe(once);
  });

  it("validates path data and point lists", () => {
    const out = clean(wrap('<path d="M0 0 L10 10 javascript:"/><polygon points="0,0 10,0 5,8"/>'));
    expect(out).not.toContain("<path d=");
    expect(out).toContain('points="0,0 10,0 5,8"');
  });
});

describe("sanitizeSvg: styles become attributes", () => {
  it("inlines class rules with the cascade (attribute < rule < style)", () => {
    const out = clean(
      wrap(
        '<style>/* c */ rect{fill:#111} .st0{fill:#e63946;stroke:#000} #x.st0{fill:#222} @media print{.st0{fill:#fff}} svg|a{fill:red}</style><rect class="st0" fill="#999" width="1" height="1"/><rect id="x" class="st0" width="1" height="1" style="stroke:#333"/>',
      ),
    );
    expect(out).toContain('<rect fill="#e63946" height="1" stroke="#000" width="1"/>');
    expect(out).toContain('<rect fill="#222" height="1" id="x" stroke="#333" width="1"/>');
  });

  it("drops unsafe declarations and properties", () => {
    const out = clean(
      wrap(
        '<rect width="1" height="1" style="fill:#0f0;behavior:url(x.htc);-moz-binding:url(y);position:fixed"/>',
      ),
    );
    expect(out).toContain('<rect fill="#0f0" height="1" width="1"/>');
  });

  it("allows only local url() references in paint", () => {
    const out = clean(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/><rect width="1" height="1" fill="url(\'#g\') url(http://x)"/>',
      ),
    );
    expect(out).toContain('fill="url(#g)"');
    expect(out).not.toContain("http://x");
  });

  it("isSafeValue rejects functions outside the whitelist", () => {
    expect(isSafeValue("fill", "rgb(1,2,3)")).toBe(true);
    expect(isSafeValue("transform", "translate(1 2) rotate(3)")).toBe(true);
    expect(isSafeValue("fill", "image(x)")).toBe(false);
    expect(isSafeValue("fill", "var(--x)")).toBe(false);
    expect(isSafeValue("fill", "url(#a)")).toBe(true);
    expect(isSafeValue("fill", "url(a.svg#a)")).toBe(false);
    expect(isSafeValue("font-family", "'Inter'")).toBe(true);
    expect(isSafeValue("fill", "'x'")).toBe(false);
  });
});

describe("sanitizeSvg: crop and recolour", () => {
  const logo = wrap(
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000" stop-opacity="0.5"/></linearGradient></defs><rect width="50" height="50" fill="url(#g)"/><circle cx="75" cy="75" r="20" stroke="#00f" fill="none" color="#0f0"/><path d="M0 0h10v10z"/>',
  );

  it("crops to a part of the viewBox and clamps to it", () => {
    const out = ok(sanitizeSvg(logo, { crop: { x: 50, y: 50, width: 80, height: 80 } }));
    expect(out.viewBox).toEqual({ x: 50, y: 50, width: 50, height: 50 });
    expect(out.svg).toContain('viewBox="50 50 50 50" width="50" height="50"');
    expect(sanitizeSvg(logo, { crop: { x: 200, y: 0, width: 5, height: 5 } })).toEqual({
      ok: false,
      error: "invalid-crop",
    });
  });

  it("recolours fills, strokes and stops, keeps none and opacity", () => {
    const out = ok(sanitizeSvg(logo, { recolor: "#123456" })).svg;
    expect(out).toContain('fill="#123456"'); // root and gradient-filled rect
    expect(out).toContain('stop-color="#123456" stop-opacity="0.5"');
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="#123456"');
    expect(out).not.toMatch(/#ff0000|#00f"|#0f0/);
    expect(sanitizeSvg(logo, { recolor: "red" })).toEqual({ ok: false, error: "invalid-color" });
  });

  it("caches by input and colour", () => {
    const a = sanitizeSvgCached(logo, { recolor: "#000000" });
    expect(sanitizeSvgCached(logo, { recolor: "#000000" })).toBe(a);
    expect(sanitizeSvgCached(logo)).not.toBe(a);
  });
});

describe("parseXml", () => {
  it("skips comments and processing instructions, keeps CDATA as text", () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- c --><svg><?pi x?><text><![CDATA[a<b]]></text></svg>',
      {
        maxDepth: 8,
        maxElements: 8,
      },
    );
    const text = root.children[0];
    expect(text?.type === "element" && text.children[0]).toEqual({ type: "text", value: "a<b" });
  });
});
