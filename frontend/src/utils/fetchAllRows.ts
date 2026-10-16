// PostgREST は 1 回で最大 1000 行しか返さない。予定が増えても欠けないように、1000 行ずつ続けて取る
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: all, error }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return { data: all, error: null }
  }
}
