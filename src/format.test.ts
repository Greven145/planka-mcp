import { describe, it, expect } from "vitest";
import {
  parseDetail,
  toText,
  stripNulls,
  toRows,
  capArray,
  truncate,
} from "./format.js";

describe("parseDetail", () => {
  it("defaults to compact for anything but 'full'", () => {
    expect(parseDetail(undefined)).toBe("compact");
    expect(parseDetail("compact")).toBe("compact");
    expect(parseDetail("nonsense")).toBe("compact");
    expect(parseDetail("full")).toBe("full");
  });
});

describe("toText", () => {
  it("serializes without indentation", () => {
    expect(toText({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    expect(toText({ a: 1 })).not.toContain("\n");
  });
});

describe("stripNulls", () => {
  it("drops null, undefined, empty string, and empty arrays/objects", () => {
    expect(
      stripNulls({ a: 1, b: null, c: undefined, d: "", e: [], f: {} })
    ).toEqual({ a: 1 });
  });

  it("preserves false and 0", () => {
    expect(stripNulls({ done: false, pos: 0 })).toEqual({ done: false, pos: 0 });
  });

  it("recurses into nested objects and arrays", () => {
    expect(
      stripNulls({ card: { name: "x", desc: null }, tags: ["a", "", null] })
    ).toEqual({ card: { name: "x" }, tags: ["a"] });
  });

  it("removes objects that become empty after cleaning", () => {
    expect(stripNulls({ meta: { only: null } })).toEqual({});
  });
});

describe("toRows", () => {
  it("emits a header line plus one row per record", () => {
    const out = toRows(
      "card",
      ["id", "name"],
      [
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ],
      (r) => [r.id, r.name]
    );
    expect(out).toBe("card(id|name):\n1|Alpha\n2|Beta");
  });

  it("returns empty string for no rows", () => {
    expect(toRows("card", ["id"], [], () => [])).toBe("");
  });

  it("joins array cells with commas and leaves empty cells blank", () => {
    const out = toRows(
      "card",
      ["name", "labels"],
      [{ name: "A", labels: ["bug", "urgent"] }, { name: "B", labels: [] }],
      (r) => [r.name, r.labels]
    );
    expect(out).toBe("card(name|labels):\nA|bug,urgent\nB|");
  });

  it("escapes pipes and flattens newlines so the grid stays parseable", () => {
    const out = toRows(
      "card",
      ["name"],
      [{ name: "a|b\nc" }],
      (r) => [r.name]
    );
    expect(out).toBe("card(name):\na\\|b c");
  });
});

describe("capArray", () => {
  it("passes arrays at or under the cap unchanged", () => {
    expect(capArray([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], more: 0 });
  });

  it("caps and reports the overflow count", () => {
    expect(capArray([1, 2, 3, 4, 5], 2)).toEqual({ items: [1, 2], more: 3 });
  });
});

describe("truncate", () => {
  it("leaves short text alone and ellipsizes long text", () => {
    expect(truncate("hi", 10)).toBe("hi");
    expect(truncate("hello world", 5)).toBe("hello…");
  });
});
