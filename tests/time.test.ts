import { expect, test } from "bun:test";
import { formatDateTime, parseDatabaseDateTime } from "../src/services/time";

test("legacy SQLite timestamps are interpreted as UTC", () => {
  expect(parseDatabaseDateTime("2026-08-19 00:00:00").toISOString()).toBe("2026-08-19T00:00:00.000Z");
});

test("timestamps are displayed in the configured application time zone", () => {
  expect(formatDateTime("2026-08-19T00:00:00.000Z")).toContain("09:00:00");
});
