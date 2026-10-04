import type { Player, MatchEvent, EventType, PlayerPosition } from './types'

it('PlayerPosition literal compiles', () => {
  const pos: PlayerPosition = 'GK'
  expect(pos).toBe('GK')
})

it('EventType includes all five values', () => {
  const types: EventType[] = ['goal', 'assist', 'yellow_card', 'red_card', 'penalty_goal']
  expect(types).toHaveLength(5)
})

it('Player has skill_rating as number', () => {
  const p: Player = {
    id: '1', name: 'Test', position: 'MID', skill_rating: 3,
    photo_url: null, is_active: true, created_at: '',
  }
  expect(typeof p.skill_rating).toBe('number')
})

it('MatchEvent suspension_minutes is nullable', () => {
  const e: MatchEvent = {
    id: '1', match_id: 'm1', player_id: 'p1', team_id: 't1',
    event_type: 'goal', related_event_id: null, minute: null,
    suspension_minutes: null, suspension_started_at: null,
    suspension_ended_at: null, created_at: '',
  }
  expect(e.suspension_minutes).toBeNull()
})
