// Makes what the morning notification needs once: the key pair that signs the app's pushes
// (VAPID) and the secret the database job shows the server function. The private key and the
// secret are appended to a file that is not in git; only the public key is printed, and it is
// the one value that goes into the app (.env.production: VITE_VAPID_PUBLIC_KEY).
// Usage: node scripts/makePushKeys.ts <path of a git-ignored env file>
import { createECDH, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The form Web Push uses: the public key is the 65-byte point (87 characters of base64url),
// the private key the 32-byte number (43 characters)
export function makePushKeys(): { publicKey: string; privateKey: string; jobSecret: string } {
  const pair = createECDH('prime256v1')
  pair.generateKeys()
  const number = pair.getPrivateKey()
  // A number that starts with zero bytes comes out shorter; the form is always 32 bytes
  const privateKey = Buffer.concat([Buffer.alloc(32 - number.length), number])
  return {
    publicKey: pair.getPublicKey().toString('base64url'),
    privateKey: privateKey.toString('base64url'),
    jobSecret: randomBytes(36).toString('base64url'),
  }
}

// Only when run as a program; imported (by the test), it writes nothing
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/makePushKeys.ts <path of a git-ignored env file>')
    process.exit(2)
  }
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (/^VAPID_PRIVATE_KEY=/m.test(before)) {
    // New keys would cut off every device already turned on
    console.error(`${file} already holds VAPID_PRIVATE_KEY; nothing was changed`)
    process.exit(1)
  }
  const { publicKey, privateKey, jobSecret } = makePushKeys()
  appendFileSync(file, [
    before && !before.endsWith('\n') ? '\n' : '',
    '# Morning notification (made by scripts/makePushKeys.ts)\n',
    `VAPID_PUBLIC_KEY=${publicKey}\n`,
    `VAPID_PRIVATE_KEY=${privateKey}\n`,
    `MORNING_PUSH_SECRET=${jobSecret}\n`,
  ].join(''))
  console.log(publicKey)
}
