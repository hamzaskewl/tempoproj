// Minimal round-trip test for the attestation signer.
// Run with: npx tsx src/oracle/sign.test.ts
import nacl from 'tweetnacl'
import { buildAttestationMessage, signAttestationWith, ATTEST_MESSAGE_LEN, ATTEST_DOMAIN } from './sign'
import { encodeChannel32 } from './moods'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

function testMessageLayout() {
  const msg = buildAttestationMessage({
    channel: 'XQC',
    mood: 0,
    windowStart: 1_700_000_000,
    windowEnd: 1_700_000_300,
  })
  assert(msg.length === ATTEST_MESSAGE_LEN, `length ${msg.length} != 66`)
  assert(msg.subarray(0, 16).equals(ATTEST_DOMAIN), 'domain prefix mismatch')
  const chan = encodeChannel32('xqc')
  assert(msg.subarray(16, 48).equals(chan), 'channel encoding mismatch (should be lowercase zero-padded)')
  assert(msg[48] === 0, `mood byte ${msg[48]} != 0`)
  assert(msg.readBigInt64LE(49) === 1_700_000_000n, 'windowStart mismatch')
  assert(msg.readBigInt64LE(57) === 1_700_000_300n, 'windowEnd mismatch')
  assert(msg[65] === 1, 'fired byte != 1')
  console.log('PASS: message layout')
}

function testRoundTrip() {
  const kp = nacl.sign.keyPair()
  const att = signAttestationWith(kp.secretKey, {
    channel: 'pokimane',
    mood: 3,
    windowStart: 1_712_000_000,
    windowEnd: 1_712_000_300,
  })
  const ok = nacl.sign.detached.verify(att.message, att.signature, kp.publicKey)
  assert(ok, 'signature did not verify')
  // Tamper detection
  const tampered = Buffer.from(att.message)
  tampered[48] ^= 0xff
  const badOk = nacl.sign.detached.verify(tampered, att.signature, kp.publicKey)
  assert(!badOk, 'tampered message verified (should have failed)')
  // Wrong signer detection
  const other = nacl.sign.keyPair()
  const wrongOk = nacl.sign.detached.verify(att.message, att.signature, other.publicKey)
  assert(!wrongOk, 'wrong pubkey verified (should have failed)')
  console.log('PASS: sign/verify round-trip + tamper + wrong-signer')
}

testMessageLayout()
testRoundTrip()
console.log('all tests passed')
