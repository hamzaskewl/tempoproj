import { Keypair } from '@solana/web3.js'

let cached: Keypair | null = null

export function loadOracleKeypair(): Keypair {
  if (cached) return cached
  const b64 = process.env.SOLANA_ORACLE_KEYPAIR_BASE64
  if (!b64) {
    throw new Error('SOLANA_ORACLE_KEYPAIR_BASE64 not set — oracle cannot sign')
  }
  const secret = Buffer.from(b64, 'base64')
  if (secret.length !== 64) {
    throw new Error(`SOLANA_ORACLE_KEYPAIR_BASE64 must decode to 64 bytes, got ${secret.length}`)
  }
  cached = Keypair.fromSecretKey(secret)
  return cached
}

export function hasOracleKeypair(): boolean {
  return !!process.env.SOLANA_ORACLE_KEYPAIR_BASE64
}
