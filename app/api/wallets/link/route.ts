import { createHash } from 'crypto'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { PublicKey } from '@solana/web3.js'
import { requireAuth } from '@/src/middleware-helpers'
import { parseSessionToken } from '@/src/auth'
import { db } from '@/src/db/index'
import { userWallets } from '@/src/db/schema'
import { sql } from 'drizzle-orm'

// The nonce the wallet must sign is deterministic per session:
//   nonce = sha256(sessionToken).hex
// This binds the signature to the current logged-in session without needing
// a server-side nonce store.
function nonceForSession(sessionToken: string): string {
  return createHash('sha256').update(sessionToken).digest('hex')
}

export async function GET(req: Request) {
  const user = await requireAuth(req)
  if (user instanceof Response) return user
  const token = parseSessionToken(req.headers.get('cookie') ?? undefined)
  if (!token) return Response.json({ error: 'no session token' }, { status: 401 })
  return Response.json({ nonce: nonceForSession(token) })
}

export async function POST(req: Request) {
  const user = await requireAuth(req)
  if (user instanceof Response) return user

  const token = parseSessionToken(req.headers.get('cookie') ?? undefined)
  if (!token) return Response.json({ error: 'no session token' }, { status: 401 })
  const expectedNonce = nonceForSession(token)

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
  const { walletAddress, signature, message } = body || {}
  if (typeof walletAddress !== 'string' || typeof signature !== 'string' || typeof message !== 'string') {
    return Response.json({ error: 'missing walletAddress/signature/message' }, { status: 400 })
  }

  // The signed message must contain the expected nonce so replay against
  // another session is impossible.
  if (!message.includes(expectedNonce)) {
    return Response.json({ error: 'message does not contain session nonce' }, { status: 400 })
  }

  let pubkey: PublicKey
  try { pubkey = new PublicKey(walletAddress) } catch {
    return Response.json({ error: 'invalid wallet address' }, { status: 400 })
  }

  let sigBytes: Uint8Array
  try {
    sigBytes = signature.startsWith('0x')
      ? Buffer.from(signature.slice(2), 'hex')
      : bs58.decode(signature)
  } catch {
    return Response.json({ error: 'invalid signature encoding' }, { status: 400 })
  }

  const ok = nacl.sign.detached.verify(
    Buffer.from(message, 'utf8'),
    sigBytes,
    pubkey.toBytes(),
  )
  if (!ok) return Response.json({ error: 'signature verification failed' }, { status: 400 })

  if (!db) return Response.json({ error: 'database unavailable' }, { status: 503 })

  await db.insert(userWallets).values({
    userId: user.id,
    walletAddress,
  }).onConflictDoUpdate({
    target: [userWallets.userId, userWallets.walletAddress],
    set: { linkedAt: sql`NOW()` },
  })

  return Response.json({ ok: true, userId: user.id, walletAddress })
}
