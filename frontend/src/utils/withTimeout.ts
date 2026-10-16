// 書き込み（開始・完了・移行など）は必ず時間切れ付きで呼ぶ。無限に待たせない（全プロジェクト共通の決まり）
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export const withTimeout = <T>(promise: Promise<T>, ms = 15_000, label = '処理'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label}が ${Math.round(ms / 1000)} 秒たっても終わりませんでした。通信状況を確かめて、もう一度お試しください。`))
    }, ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
