import { describe, expect, it } from "vitest";
import { isAdminRequest } from "./admin.js";

const TOKEN = "s3cr3t-admin-token";

describe("isAdminRequest", () => {
  it("ADMIN_TOKEN 미설정이면 어떤 후보도 false (기능 비활성)", () => {
    expect(isAdminRequest([TOKEN], undefined)).toBe(false);
    expect(isAdminRequest([TOKEN], "")).toBe(false);
  });

  it("후보 중 하나라도 토큰과 일치하면 true", () => {
    expect(isAdminRequest([TOKEN], TOKEN)).toBe(true);
    expect(isAdminRequest([undefined, TOKEN], TOKEN)).toBe(true);
    expect(isAdminRequest([null, "wrong", TOKEN], TOKEN)).toBe(true);
  });

  it("일치하는 후보가 없으면 false", () => {
    expect(isAdminRequest(["wrong", "nope"], TOKEN)).toBe(false);
    expect(isAdminRequest([], TOKEN)).toBe(false);
    expect(isAdminRequest([undefined, null, ""], TOKEN)).toBe(false);
  });

  it("길이가 다른 후보는 안전하게 false (상수시간 비교 길이 가드)", () => {
    expect(isAdminRequest([`${TOKEN}x`], TOKEN)).toBe(false);
    expect(isAdminRequest([TOKEN.slice(0, -1)], TOKEN)).toBe(false);
  });
});
