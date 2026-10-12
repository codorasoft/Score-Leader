import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The backup is taken before a migration is applied, so a table that only arrives with that
// migration must be skipped, not stop the run before the photos and the manifest are written.
it('skips every table that a not-yet-applied migration brings', () => {
  const src = readFileSync(resolve(__dirname, 'backup.ts'), 'utf8')
  const optional = src.match(/const OPTIONAL = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
  for (const table of ['admin_profiles', 'leagues', 'training_types', 'training_videos', 'trainings', 'training_items']) {
    expect(optional).toContain(`'${table}'`)
  }
})
