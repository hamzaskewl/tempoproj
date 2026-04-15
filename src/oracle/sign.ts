import nacl from 'tweetnacl'
import { loadOracleKeypair } from './keypair'
import { encodeChannel32 } from './moods'

// Canonical attestation message layout (66 bytes):
//   domain   b"clippy-attest-v1" (16 bytes)
//   channel  u8[32] ascii-lowercase zero-padded
//   mood     u8
//   wstart   i64 LE
//   wend     i64 LE
//   fired    u8 (always 1 for positive attestation)
// Must match the on-chain verifier exactly.
export const ATTEST_DOMAIN = Buffer.from('clippy-attest-v1', 'ascii') // 16 bytes
export const ATTEST_MESSAGE_LEN = 66

export interface AttestationInput {
  channel: string
  mood: number   // u8
  windowStart: number | bigint   // i64 seconds
  windowEnd: number | bigint     // i64 seconds
}

export function buildAttestationMessage(input: AttestationInput): Buffer {
  if (ATTEST_DOMAIN.length !== 16) throw new Error('domain must be 16 bytes')
  const out = Buffer.alloc(ATTEST_MESSAGE_LEN)
  let o = 0
  ATTEST_DOMAIN.copy(out, o); o += 16
  encodeChannel32(input.channel).copy(out, o); o += 32
  out.writeUInt8(input.mood & 0xff, o); o += 1
  out.writeBigInt64LE(BigInt(input.windowStart), o); o += 8
  out.writeBigInt64LE(BigInt(input.windowEnd), o); o += 8
  out.writeUInt8(1, o); o += 1
  if (o !== ATTEST_MESSAGE_LEN) throw new Error(`bad message length ${o}`)
  return out
}

export interface SignedAttestation {
  message: Buffer
  signature: Buffer
  publicKey: Buffer
}

export function signAttestation(input: AttestationInput): SignedAttestation {
  const kp = loadOracleKeypair()
  const message = buildAttestationMessage(input)
  const signature = Buffer.from(nacl.sign.detached(message, kp.secretKey))
  return { message, signature, publicKey: Buffer.from(kp.publicKey.toBytes()) }
}

// Test helper: sign with a provided secret key (64-byte nacl secret) instead of env keypair.
export function signAttestationWith(
  secretKey: Uint8Array,
  input: AttestationInput,
): SignedAttestation {
  const message = buildAttestationMessage(input)
  const signature = Buffer.from(nacl.sign.detached(message, secretKey))
  const kp = nacl.sign.keyPair.fromSecretKey(secretKey)
  return { message, signature, publicKey: Buffer.from(kp.publicKey) }
}
