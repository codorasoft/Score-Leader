import { PRESETS } from './matchFormat'
import { matchScreen, type ScreenMatch } from './matchScreen'

const m = (o: Partial<ScreenMatch> = {}): ScreenMatch => ({
  period: 1, period_seconds: [], team1_score: 0, team2_score: 0, timer_status: 'running', status: 'active', ...o,
})
const clock = (elapsed: number, timerStatus?: ScreenMatch['timer_status']) => ({ elapsed, timerStatus })

describe('matchScreen', () => {
  it('in play before time: ends the period early, not the end yet', () => {
    const s = matchScreen(PRESETS.halves, m(), clock(100), false)
    expect(s.step).toEqual({ kind: 'endPeriod', period: 1, timeUp: false })
    expect(s).toMatchObject({ reachedEnd: false, between: false, showPenalties: false, endsMatch: false, endsPeriodOnly: true, periodSeconds: 600 })
  })

  it('a one-period match at time: ending the period ends the match, and the end is reached', () => {
    const s = matchScreen(PRESETS.quick, m(), clock(420), false)
    expect(s).toMatchObject({ reachedEnd: true, endsMatch: true, endsPeriodOnly: false })
  })

  it('the clock state on this phone wins over the match row: stopped on a recorded half is the break', () => {
    const s = matchScreen(PRESETS.halves, m({ period_seconds: [600] }), clock(600, 'stopped'), false)
    expect(s.step).toEqual({ kind: 'startPeriod', period: 2 })
    expect(s.between).toBe(true)
  })

  it('a goal limit reached ends the match', () => {
    const s = matchScreen(PRESETS.quick, m({ team1_score: 2 }), clock(30), false)
    expect(s).toMatchObject({ reachedEnd: true, step: { kind: 'endMatch', reason: 'goalLimit' } })
  })

  it('penalties show in penalty mode or in period 5, never once the match is over', () => {
    expect(matchScreen(PRESETS.knockout, m(), clock(0), true).showPenalties).toBe(true)
    expect(matchScreen(PRESETS.knockout, m({ period: 5, timer_status: 'stopped' }), clock(0), false).showPenalties).toBe(true)
    const over = matchScreen(PRESETS.knockout, m({ period: 5, status: 'completed' }), clock(0), true)
    expect(over).toMatchObject({ showPenalties: false, matchOver: true, between: false })
  })
})
