import { createECDH } from 'node:crypto'
import { makePushKeys } from './makePushKeys.ts'

it('makes a key pair in the form Web Push uses, and a long secret', () => {
  const { publicKey, privateKey, jobSecret } = makePushKeys()
  expect(publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/)
  expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(jobSecret).toMatch(/^[A-Za-z0-9_-]{48}$/)
  const point = Buffer.from(publicKey, 'base64url')
  expect(point.length).toBe(65)
  expect(point[0]).toBe(4)
  // The public key really belongs to the private one
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
  expect(ecdh.getPublicKey().equals(point)).toBe(true)
})

it('makes different keys each time', () => {
  expect(makePushKeys().privateKey).not.toBe(makePushKeys().privateKey)
})
