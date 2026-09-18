export type NumberGroup<T> = { id: number; name: string; entries: T[] };
export type MeasuredNumberGroup<T> = {
  id: number;
  name: string;
  headingHeight: number;
  rows: { entries: T[]; height: number }[];
};
export type NumberPage<T> = { groups: NumberGroup<T>[]; height: number; overflowing: boolean };

// Pack complete, measured rows. Repeat the location heading on continuation
// pages, and never split a number from its date label.
export function paginateNumberGroups<T>(
  groups: MeasuredNumberGroup<T>[], availableHeight: number, locationGap: number, rowGap: number,
): NumberPage<T>[] {
  const pages: NumberPage<T>[] = [];
  let page: NumberPage<T> = { groups: [], height: 0, overflowing: false };
  for (const group of groups) {
    for (const row of group.rows) {
      if (!row.entries.length) continue;
      let continuing = page.groups.at(-1)?.id === group.id;
      let extraHeight = row.height + (continuing ? rowGap : group.headingHeight + (page.groups.length ? locationGap : 0));
      if (page.groups.length && page.height + extraHeight > availableHeight) {
        pages.push(page);
        page = { groups: [], height: 0, overflowing: false };
        continuing = false;
        extraHeight = group.headingHeight + row.height;
      }
      if (!continuing) page.groups.push({ id: group.id, name: group.name, entries: [] });
      page.groups.at(-1)!.entries.push(...row.entries);
      page.height += extraHeight;
      page.overflowing ||= page.height > availableHeight;
    }
  }
  if (page.groups.length) pages.push(page);
  return pages.length ? pages : [{ groups: [], height: 0, overflowing: false }];
}
