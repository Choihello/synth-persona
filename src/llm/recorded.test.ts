import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { MockProvider } from "./mock.js";
import { RecordedProvider, cassetteKey } from "./recorded.js";

const dir = mkdtempSync(join(tmpdir(), "vcr-"));
const cassette = join(dir, "c.json");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("RecordedProvider", () => {
  test("record 모드는 underlying을 호출하고 저장, replay는 재생", async () => {
    const persona = { id: "1", attrs: { age: "40대" } };
    const rec = new RecordedProvider({ cassettePath: cassette, mode: "record", underlying: new MockProvider(() => "녹화응답") });
    expect(await rec.ask(persona, "q")).toBe("녹화응답");

    // underlying 없이 replay 가능해야 함
    const play = new RecordedProvider({ cassettePath: cassette, mode: "replay" });
    expect(await play.ask(persona, "q")).toBe("녹화응답");
  });

  test("키는 결정적", () => {
    const p = { id: "x", attrs: { a: "1" } };
    expect(cassetteKey(p, "q")).toBe(cassetteKey(p, "q"));
  });

  test("replay에 없는 키는 throw", async () => {
    const play = new RecordedProvider({ cassettePath: cassette, mode: "replay" });
    await expect(play.ask({ id: "z", attrs: {} }, "없음")).rejects.toThrow(/cassette/i);
  });
});
