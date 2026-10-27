import { describe, expect, it } from "vitest";

import {
  base64ToBytes,
  bytesToBase64,
  percentDecode,
  percentEncodeForDataUri,
  utf8ByteLength,
  utf8Encode,
} from "./bytes";
import {
  MAX_INPUT_BYTES,
  base64ToImage,
  base64ToSvg,
  cssToSvg,
  formatDataUri,
  imageToBase64,
  prepareSvg,
  svgToBase64,
  svgToCss,
  type Result,
} from "./converters";
import { extractDataUris, parseDataUri } from "./data-uri";
import { looksLikeSvg, sniffImageType } from "./sniff";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#f50"/></svg>';
const SVG_BASE64 = bytesToBase64(utf8Encode(SVG));

/** 1×1 transparent PNG. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG = base64ToBytes(PNG_BASE64) as Uint8Array;
const GIF = utf8Encode("GIF89a\x01\x00\x01\x00");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = utf8Encode("RIFF\x10\x00\x00\x00WEBPVP8 ");

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

function error<T>(result: Result<T>): string {
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("bytes", () => {
  it("round-trips Base64 including non-ASCII", () => {
    const bytes = utf8Encode("Grüezi ✓ 🎨");
    expect(decode(base64ToBytes(bytesToBase64(bytes)) as Uint8Array)).toBe("Grüezi ✓ 🎨");
  });

  it("accepts whitespace, missing padding and Base64url", () => {
    expect(decode(base64ToBytes("SGVs\nbG8g\r\n d29y bGQ") as Uint8Array)).toBe("Hello world");
    expect(decode(base64ToBytes("-_8") as Uint8Array)).toEqual(
      decode(base64ToBytes("+/8=") as Uint8Array),
    );
  });

  it("rejects invalid Base64", () => {
    expect(base64ToBytes("abc$")).toBeNull();
    expect(base64ToBytes("abcde")).toBeNull();
    expect(base64ToBytes("ab=c")).toBeNull();
  });

  it("percent-decodes leniently", () => {
    expect(decode(percentDecode("a%20b%zz%"))).toBe("a b%zz%");
    expect(decode(percentDecode("%C3%BC"))).toBe("ü");
  });

  it("percent-encodes only unsafe characters", () => {
    expect(percentEncodeForDataUri(`<a b="#1" c='x'>ü%</a>`)).toBe(
      "%3Ca b=%22%231%22 c='x'%3E%C3%BC%25%3C/a%3E",
    );
    expect(percentEncodeForDataUri("\n\t{}")).toBe("%0A%09%7B%7D");
  });

  it("counts UTF-8 bytes", () => {
    expect(utf8ByteLength("aü✓🎨")).toBe(utf8Encode("aü✓🎨").length);
  });
});

describe("sniffing", () => {
  it("recognises allowed image types by magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF)).toBe("image/gif");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(utf8Encode(SVG))).toBe("image/svg+xml");
  });

  it("rejects everything else", () => {
    expect(sniffImageType(utf8Encode("<!doctype html><html><svg></svg></html>"))).toBeNull();
    expect(sniffImageType(utf8Encode("hello"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xc3, 0x28]))).toBeNull();
  });

  it("accepts an SVG prolog", () => {
    const prolog =
      '﻿<?xml version="1.0"?>\n<!-- c --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n';
    expect(looksLikeSvg(prolog + SVG)).toBe(true);
    expect(looksLikeSvg('<!DOCTYPE svg [ <!ENTITY a "b"> ]><svg/>')).toBe(true);
    expect(looksLikeSvg("<svg:svg xmlns:svg='http://www.w3.org/2000/svg'></svg:svg>")).toBe(true);
  });

  it("requires an svg root element", () => {
    expect(looksLikeSvg("<svgx></svgx>")).toBe(false);
    expect(looksLikeSvg("<div><svg></svg></div>")).toBe(false);
    expect(looksLikeSvg("<svg>")).toBe(false);
    expect(looksLikeSvg("<!-- <svg></svg>")).toBe(false);
  });
});

describe("data URIs", () => {
  it("parses URL-encoded and Base64 bodies", () => {
    const encoded = value(parseDataUri("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E"));
    expect(encoded).toMatchObject({ mime: "image/svg+xml", base64: false });
    expect(decode(encoded.bytes)).toBe("<svg></svg>");

    const b64 = value(parseDataUri(` DATA:Image/SVG+XML;BASE64,${SVG_BASE64} `));
    expect(b64).toMatchObject({ mime: "image/svg+xml", base64: true });
    expect(decode(b64.bytes)).toBe(SVG);
  });

  it("defaults to text/plain and rejects malformed URIs", () => {
    expect(value(parseDataUri("data:,hi")).mime).toBe("text/plain");
    expect(error(parseDataUri("data:image/png;base64"))).toBe("invalidDataUri");
    expect(error(parseDataUri("image/png;base64,AAAA"))).toBe("invalidDataUri");
    expect(error(parseDataUri("data:not a type,x"))).toBe("invalidDataUri");
    expect(error(parseDataUri("data:image/png;base64,@@@"))).toBe("invalidBase64");
  });

  it("extracts URIs from quoted, unquoted and bare forms", () => {
    expect(
      extractDataUris(`a { background: url("data:image/svg+xml,%3Csvg%3E") no-repeat; }`),
    ).toEqual(["data:image/svg+xml,%3Csvg%3E"]);
    expect(extractDataUris(`url('data:image/svg+xml,<svg a=\\'1\\'/>')`)).toEqual([
      "data:image/svg+xml,<svg a='1'/>",
    ]);
    expect(
      extractDataUris("url(data:image/png;base64,AAAA) , url( data:image/gif;base64,BBBB )"),
    ).toEqual(["data:image/png;base64,AAAA", "data:image/gif;base64,BBBB"]);
    expect(extractDataUris("data:image/png;base64,AAAA; color: red")).toEqual([
      "data:image/png;base64,AAAA",
    ]);
    expect(extractDataUris("no uri here")).toEqual([]);
  });
});

describe("prepareSvg", () => {
  it("adds a missing SVG namespace", () => {
    const result = value(prepareSvg('<?xml version="1.0"?><svg viewBox="0 0 1 1"></svg>'));
    expect(result.addedNamespace).toBe(true);
    expect(result.svg).toBe(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
    );
    expect(value(prepareSvg(SVG)).addedNamespace).toBe(false);
  });

  it("validates input", () => {
    expect(error(prepareSvg("   \n "))).toBe("empty");
    expect(error(prepareSvg("<html></html>"))).toBe("notSvg");
    expect(error(prepareSvg(`<svg>${"a".repeat(MAX_INPUT_BYTES)}</svg>`))).toBe("tooLarge");
  });
});

describe("svgToCss and cssToSvg", () => {
  it("encodes compactly and collapses whitespace", () => {
    const { dataUri } = value(svgToCss(`  ${SVG.replace("><", ">\n    <")}\n`));
    expect(dataUri).toBe(
      "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22%3E %3Ccircle cx=%225%22 cy=%225%22 r=%224%22 fill=%22%23f50%22/%3E%3C/svg%3E",
    );
    expect(formatDataUri(dataUri, "css")).toBe(`background-image: url("${dataUri}");`);
  });

  it("round-trips through CSS", () => {
    const css = formatDataUri(value(svgToCss(SVG)).dataUri, "css");
    const decoded = value(cssToSvg(`.hero {\n  ${css}\n}`));
    expect(decoded.svg).toBe(SVG);
    expect(decoded.found).toBe(1);
    expect(decoded.dataUri).toBe(`data:image/svg+xml;base64,${SVG_BASE64}`);
  });

  it("reads Base64 data URIs and skips non-SVG ones", () => {
    const css = `background: url(data:image/png;base64,${PNG_BASE64}), url("data:image/svg+xml;base64,${SVG_BASE64}");`;
    const decoded = value(cssToSvg(css));
    expect(decoded.svg).toBe(SVG);
    expect(decoded.found).toBe(2);
  });

  it("reports why nothing was found", () => {
    expect(error(cssToSvg(""))).toBe("empty");
    expect(error(cssToSvg("color: red;"))).toBe("noDataUri");
    expect(error(cssToSvg(`url(data:image/png;base64,${PNG_BASE64})`))).toBe("unsupportedType");
    expect(error(cssToSvg('url("data:image/svg+xml,%3Cp%3E")'))).toBe("notSvg");
    expect(error(cssToSvg('url("data:image/svg+xml;base64,%%%")'))).toBe("invalidBase64");
  });
});

describe("svgToBase64 and base64ToSvg", () => {
  it("round-trips Unicode SVG", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Grüezi 🎨</text></svg>';
    const encoded = value(svgToBase64(svg));
    expect(encoded.dataUri).toBe(`data:image/svg+xml;base64,${encoded.base64}`);
    expect(value(base64ToSvg(encoded.dataUri)).svg).toBe(svg);
    expect(value(base64ToSvg(encoded.base64 as string)).svg).toBe(svg);
  });

  it("keeps whitespace in the markup", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">\n  <g/>\n</svg>';
    expect(decode(base64ToBytes(value(svgToBase64(svg)).base64 as string) as Uint8Array)).toBe(svg);
  });

  it("accepts wrapped and line-broken input", () => {
    const wrapped = SVG_BASE64.replace(/(.{20})/g, "$1\n");
    expect(value(base64ToSvg(`\n  ${wrapped}  \n`)).svg).toBe(SVG);
    expect(
      value(base64ToSvg(`background: url("data:image/svg+xml;base64,${SVG_BASE64}");`)).svg,
    ).toBe(SVG);
    expect(value(base64ToSvg("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")).svg).toBe("<svg></svg>");
  });

  it("rejects non-SVG and non-image types", () => {
    expect(error(base64ToSvg(""))).toBe("empty");
    expect(error(base64ToSvg("not base64!"))).toBe("invalidBase64");
    expect(error(base64ToSvg(PNG_BASE64))).toBe("notSvg");
    expect(error(base64ToSvg(`data:text/html;base64,${SVG_BASE64}`))).toBe("unsupportedType");
    expect(error(base64ToSvg(bytesToBase64(utf8Encode("<script>alert(1)</script>"))))).toBe(
      "notSvg",
    );
  });

  it("rejects oversized input", () => {
    expect(error(base64ToSvg("A".repeat(Math.ceil((MAX_INPUT_BYTES * 4) / 3) + 70_000)))).toBe(
      "tooLarge",
    );
    const justOver = bytesToBase64(new Uint8Array(MAX_INPUT_BYTES + 3));
    expect(error(base64ToSvg(justOver))).toBe("tooLarge");
  });
});

describe("imageToBase64 and base64ToImage", () => {
  it("encodes images by sniffed type, ignoring the file name", () => {
    const encoded = value(imageToBase64(PNG));
    expect(encoded.mime).toBe("image/png");
    expect(encoded.dataUri).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(value(imageToBase64(utf8Encode(SVG))).mime).toBe("image/svg+xml");
  });

  it("rejects empty, oversized and non-image files", () => {
    expect(error(imageToBase64(new Uint8Array()))).toBe("empty");
    expect(error(imageToBase64(new Uint8Array(MAX_INPUT_BYTES + 1)))).toBe("tooLarge");
    expect(error(imageToBase64(utf8Encode("<html></html>")))).toBe("unsupportedType");
  });

  it("decodes raw Base64 and data URIs", () => {
    const raw = value(base64ToImage(PNG_BASE64));
    expect(raw).toMatchObject({ mime: "image/png", extension: "png", typeMismatch: false });
    expect(raw.bytes).toEqual(PNG);
    expect(value(base64ToImage(`data:image/png;base64,${PNG_BASE64}`)).typeMismatch).toBe(false);
    expect(value(base64ToImage(`data:image/jpeg;base64,${PNG_BASE64}`))).toMatchObject({
      mime: "image/png",
      typeMismatch: true,
      dataUri: `data:image/png;base64,${PNG_BASE64}`,
    });
    expect(value(base64ToImage(bytesToBase64(GIF))).extension).toBe("gif");
    expect(value(base64ToImage(bytesToBase64(JPEG))).extension).toBe("jpg");
    expect(value(base64ToImage(bytesToBase64(WEBP))).extension).toBe("webp");
  });

  it("rejects non-image payloads and types", () => {
    const html = bytesToBase64(utf8Encode("<!doctype html><script>alert(1)</script>"));
    expect(error(base64ToImage(html))).toBe("notAnImage");
    expect(error(base64ToImage(`data:text/html;base64,${PNG_BASE64}`))).toBe("unsupportedType");
    expect(error(base64ToImage(`data:application/javascript;base64,${html}`))).toBe(
      "unsupportedType",
    );
    expect(error(base64ToImage(`data:image/png;base64,${html}`))).toBe("notAnImage");
    expect(error(base64ToImage("data:image/png;base64"))).toBe("invalidDataUri");
    expect(error(base64ToImage("   "))).toBe("empty");
  });
});

describe("formatDataUri", () => {
  const uri = `data:image/png;base64,${PNG_BASE64}`;

  it("wraps a data URI in every format", () => {
    expect(formatDataUri(uri, "dataUri")).toBe(uri);
    expect(formatDataUri(uri, "base64")).toBe(PNG_BASE64);
    expect(formatDataUri(uri, "html")).toBe(`<img src="${uri}" alt="">`);
    expect(formatDataUri(uri, "css")).toBe(`background-image: url("${uri}");`);
  });

  it("keeps a URL-encoded URI whole when asked for Base64", () => {
    expect(formatDataUri("data:image/svg+xml,%3Csvg/%3E", "base64")).toBe(
      "data:image/svg+xml,%3Csvg/%3E",
    );
  });
});

describe("performance", () => {
  it("converts a near-limit SVG quickly", () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg">${'<rect x="1" y="2" width="3" height="4" fill="#abc"/>'.repeat(90_000)}</svg>`;
    expect(utf8ByteLength(big)).toBeLessThan(MAX_INPUT_BYTES);
    // Fastest of two runs after a warm-up: one slow run on a busy CI runner (GC, neighbours) is noise.
    let elapsed = Infinity;
    let css = value(svgToCss(big));
    for (let i = 0; i < 2; i++) {
      const start = performance.now();
      css = value(svgToCss(big));
      elapsed = Math.min(elapsed, performance.now() - start);
    }
    expect(value(cssToSvg(formatDataUri(css.dataUri, "css"))).svg).toBe(big);
    // Locally about 250 ms; generous for shared CI runners, still catches a
    // quadratic regression (minutes on a 4.5 MB input).
    expect(elapsed).toBeLessThan(3000);
  }, 30_000); // Three conversions of 4.5 MB can exceed the default 5 s on a slow runner.
});
