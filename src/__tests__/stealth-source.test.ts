import { describe, expect, test } from "bun:test";
import { parseHtmlList } from "../stealth-source.ts";

describe("parseHtmlList", () => {
  const html = `
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3><span>Nov 26 2025</span></a>
    <a href="/engineering/postmortem"><h3>A postmortem</h3></a>
    <a href="/about">About</a>
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3></a>`;

  test("extracts prefix-matching anchors as {title,url}, absolute + deduped", async () => {
    const out = await parseHtmlList(html, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([
      { title: "Effective harnesses Nov 26 2025", url: "https://www.anthropic.com/engineering/harnesses" },
      { title: "A postmortem", url: "https://www.anthropic.com/engineering/postmortem" },
    ]);
  });

  test("ignores non-matching anchors and empty-text anchors", async () => {
    const out = await parseHtmlList(`<a href="/engineering/x"></a><a href="/news/y">Y</a>`, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([]);
  });
});
