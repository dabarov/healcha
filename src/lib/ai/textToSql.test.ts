import { describe, expect, it } from "vitest";
import { sanitizeSql } from "./textToSql";

describe("sanitizeSql", () => {
  it("passes a plain SELECT through with a LIMIT appended", () => {
    expect(sanitizeSql("SELECT date, steps FROM metrics_daily")).toBe(
      "SELECT date, steps FROM metrics_daily LIMIT 200",
    );
  });

  it("keeps an existing LIMIT instead of appending one", () => {
    const sql = "SELECT date FROM metrics_daily ORDER BY date DESC LIMIT 7";
    expect(sanitizeSql(sql)).toBe(sql);
  });

  it("accepts WITH (CTE) queries", () => {
    const sql = "WITH recent AS (SELECT * FROM metrics_daily LIMIT 30) SELECT * FROM recent LIMIT 30";
    expect(sanitizeSql(sql)).toBe(sql);
  });

  it("strips markdown code fences from LLM output", () => {
    expect(sanitizeSql("```sql\nSELECT 1 LIMIT 1\n```")).toBe("SELECT 1 LIMIT 1");
  });

  it("strips a single trailing semicolon", () => {
    expect(sanitizeSql("SELECT 1 LIMIT 1;")).toBe("SELECT 1 LIMIT 1");
  });

  it("rejects multiple statements", () => {
    expect(() => sanitizeSql("SELECT 1; SELECT 2")).toThrow(/multiple statements/i);
  });

  it("rejects piggybacked mutations after a semicolon", () => {
    expect(() => sanitizeSql("SELECT 1; DROP TABLE metrics_daily")).toThrow(
      /multiple statements/i,
    );
  });

  it("rejects statements that do not start with SELECT or WITH", () => {
    expect(() => sanitizeSql("DELETE FROM metrics_daily")).toThrow(/only select/i);
    expect(() => sanitizeSql("PRAGMA table_info(metrics_daily)")).toThrow(/only select/i);
  });

  it("rejects mutation keywords hidden inside a SELECT", () => {
    expect(() =>
      sanitizeSql("WITH x AS (SELECT 1) INSERT INTO metrics_daily SELECT * FROM x"),
    ).toThrow(/forbidden keyword/i);
    expect(() => sanitizeSql("SELECT * FROM metrics_daily WHERE attach = 1")).toThrow(
      /forbidden keyword/i,
    );
  });

  it("is case-insensitive about forbidden keywords", () => {
    expect(() => sanitizeSql("select 1 union select * from x; DeLeTe from y")).toThrow();
    expect(() => sanitizeSql("WITH x AS (SELECT 1) UpDaTe metrics_daily SET steps = 0")).toThrow(
      /forbidden keyword/i,
    );
  });

  it("does not treat keyword substrings as forbidden", () => {
    // column/word contains a keyword but is not the keyword itself
    expect(sanitizeSql("SELECT created_at FROM activities LIMIT 5")).toBe(
      "SELECT created_at FROM activities LIMIT 5",
    );
  });
});
