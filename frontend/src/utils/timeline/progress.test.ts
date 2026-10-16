import { describe, expect, it } from 'vitest'
import { detectProgressEvent, progressOf } from './progress'
import { makeSchedule } from '../../test/factories'

describe('progressOf', () => {
  it('結果・時刻・状態から進み具合を決める', () => {
    expect(progressOf(makeSchedule())).toBe('todo')
    expect(progressOf(makeSchedule({ result: '作業中', started_at: '10:00' }))).toBe('active')
    expect(progressOf(makeSchedule({ result: '完了' }))).toBe('done')
    expect(progressOf(makeSchedule({ result: '', completed_at: '11:00' }))).toBe('todo')
    expect(progressOf(makeSchedule({ result: 'キャンセル' }))).toBe('cancelled')
    expect(progressOf(makeSchedule({ status: 'cancelled', result: '完了' }))).toBe('cancelled')
  })
})

describe('detectProgressEvent', () => {
  it('未着手 → 対応中 は開始', () => {
    const prev = makeSchedule()
    const next = makeSchedule({ result: '作業中', started_at: '10:15' })
    expect(detectProgressEvent(prev, next)).toEqual({ kind: 'start', at: '10:15' })
  })

  it('対応中 → 完了、未着手 → 完了 は完了', () => {
    expect(detectProgressEvent(makeSchedule({ result: '作業中', started_at: '10:15' }), makeSchedule({ started_at: '10:15', completed_at: '14:32', result: '完了' }))).toEqual({ kind: 'complete', at: '14:32' })
    expect(detectProgressEvent(makeSchedule(), makeSchedule({ result: '完了' }))).toEqual({ kind: 'complete', at: '' })
  })

  it('変化なし・取り消し・前の状態が分からないときは null', () => {
    expect(detectProgressEvent(makeSchedule({ result: '完了' }), makeSchedule({ result: '完了' }))).toBeNull()
    expect(detectProgressEvent(makeSchedule({ result: '作業中', started_at: '10:00' }), makeSchedule())).toBeNull()
    expect(detectProgressEvent(makeSchedule({ result: 'キャンセル' }), makeSchedule({ result: '完了' }))).toBeNull()
    expect(detectProgressEvent(undefined, makeSchedule({ result: '完了' }))).toBeNull()
  })
})
