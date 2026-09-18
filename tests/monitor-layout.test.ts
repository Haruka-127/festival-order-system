import { expect, test } from "bun:test";
import { paginateNumberGroups, type MeasuredNumberGroup } from "../src/client/monitor-layout";

function location(id: number, rowSizes: number[], columns = 4, headingHeight = 30): MeasuredNumberGroup<string> {
  return { id, name: `提供場所${id}`, headingHeight, rows: rowSizes.map((height, row) => ({
    height, entries: Array.from({ length: columns }, (_, column) => `${id}-${row}-${column}`),
  })) };
}

test("a wide monitor shows complete horizontal rows beyond ten numbers", () => {
  const pages = paginateNumberGroups([location(1, [70, 70, 70, 70, 70], 6)], 420, 20, 8);
  expect(pages).toHaveLength(1);
  expect(pages[0]!.groups[0]!.entries).toHaveLength(30);
  expect(pages[0]!.height).toBe(412);
  expect(pages[0]!.overflowing).toBe(false);
});

test("a continuation page repeats the location heading and preserves every number once", () => {
  const group = location(1, [70, 70, 70, 70], 5);
  const pages = paginateNumberGroups([group], 180, 20, 8);
  expect(pages).toHaveLength(2);
  expect(pages.map(page => page.groups[0]!.name)).toEqual([group.name, group.name]);
  expect(pages.map(page => page.height)).toEqual([178, 178]);
  expect(pages.flatMap(page => page.groups.flatMap(section => section.entries))).toEqual(group.rows.flatMap(row => row.entries));
});

test("each location heading and the gap between locations consume space", () => {
  const pages = paginateNumberGroups([location(1, [60]), location(2, [60], 4, 50)], 200, 20, 8);
  expect(pages).toHaveLength(2);
  expect(pages[0]!.height).toBe(90);
  expect(pages[1]!.height).toBe(110);
});

test("wrapped headings and date labels move a complete row onto the next page", () => {
  const pages = paginateNumberGroups([location(1, [70, 95, 70], 3, 65)], 225, 20, 8);
  expect(pages).toHaveLength(3);
  expect(pages.map(page => page.groups[0]!.entries.length)).toEqual([3, 3, 3]);
  expect(pages.every(page => page.height <= 225 && !page.overflowing)).toBe(true);
});

test("a row fitting the exact remaining height stays on the current page", () => {
  const pages = paginateNumberGroups([location(1, [50]), location(2, [60])], 190, 20, 8);
  expect(pages).toHaveLength(1);
  expect(pages[0]!.height).toBe(190);
  expect(pages[0]!.groups.map(group => group.id)).toEqual([1, 2]);
});

test("resizing changes capacity without dropping or reordering entries", () => {
  const groups = [location(1, [70, 70, 70, 70]), location(2, [70, 70])];
  const wide = paginateNumberGroups(groups, 540, 20, 8);
  const short = paginateNumberGroups(groups, 180, 20, 8);
  expect(wide).toHaveLength(1);
  expect(short).toHaveLength(3);
  expect(short.flatMap(page => page.groups.flatMap(group => group.entries))).toEqual(wide[0]!.groups.flatMap(group => group.entries));
});

test("narrow screens can show every row in the scrolling document", () => {
  const pages = paginateNumberGroups([location(1, Array(100).fill(70), 2)], Infinity, 20, 8);
  expect(pages).toHaveLength(1);
  expect(pages[0]!.groups[0]!.entries).toHaveLength(200);
});

test("an unusually short viewport keeps oversized rows accessible instead of discarding them", () => {
  const pages = paginateNumberGroups([location(1, [70, 70])], 20, 20, 8);
  expect(pages).toHaveLength(2);
  expect(pages.every(page => page.overflowing)).toBe(true);
  expect(pages.flatMap(page => page.groups.flatMap(group => group.entries))).toHaveLength(8);
});

test("an empty board or a location without rows has a single empty page", () => {
  expect(paginateNumberGroups([], 300, 20, 8)).toEqual([{ groups: [], height: 0, overflowing: false }]);
  expect(paginateNumberGroups([location(1, [])], 300, 20, 8)).toEqual([{ groups: [], height: 0, overflowing: false }]);
});
