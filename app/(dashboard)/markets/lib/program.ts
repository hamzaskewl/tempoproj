// Client-safe Anchor helpers. Mirrors src/oracle/client.ts but with no Node/env
// dependencies — loads program id from NEXT_PUBLIC_CLIPPY_PROGRAM_ID and expects
// the caller to supply a wallet-adapter Wallet for the Provider.

import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor'
import type { Wallet } from '@coral-xyz/anchor'
import idlJson from '@/src/oracle/idl/clippy_market.json'

const IDL = idlJson as unknown as Idl

const MARKET_SEED = new TextEncoder().encode('market')
const POSITION_SEED = new TextEncoder().encode('position')
const CONFIG_SEED = new TextEncoder().encode('config')
const ESCROW_SEED = new TextEncoder().encode('escrow')

export function getClientProgramId(): PublicKey {
  const id = process.env.NEXT_PUBLIC_CLIPPY_PROGRAM_ID
  if (!id) throw new Error('NEXT_PUBLIC_CLIPPY_PROGRAM_ID not set')
  return new PublicKey(id)
}

export function getClientRpcUrl(): string {
  const key = process.env.NEXT_PUBLIC_HELIUS_KEY
  if (key) return `https://devnet.helius-rpc.com/?api-key=${key}`
  return clusterApiUrl('devnet')
}

export function getClientConnection(): Connection {
  return new Connection(getClientRpcUrl(), 'confirmed')
}

export function getClientProgram(connection: Connection, wallet: Wallet): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  const idlWithAddress: Idl = { ...IDL, address: getClientProgramId().toBase58() } as Idl
  return new Program(idlWithAddress, provider)
}

// ASCII-lowercase, zero-padded to 32 bytes. Must match src/oracle/moods.ts.
export function encodeChannel32(channel: string): Uint8Array {
  const buf = new Uint8Array(32)
  const bytes = new TextEncoder().encode(channel.toLowerCase())
  if (bytes.length > 32) throw new Error(`channel too long (>32 bytes): ${channel}`)
  buf.set(bytes, 0)
  return buf
}

export const MOOD_TO_U8: Record<string, number> = {
  hype: 0, funny: 1, rage: 2, clutch: 3, awkward: 4,
  wholesome: 5, drama: 6, shock: 7, sad: 8,
}
export function moodToU8(mood: string): number {
  const u = MOOD_TO_U8[mood.toLowerCase()]
  if (typeof u !== 'number') throw new Error(`unknown mood: ${mood}`)
  return u
}

export function findConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], getClientProgramId())
}

export function findMarketPda(
  channel: string,
  mood: number,
  windowStart: number | bigint,
): [PublicKey, number] {
  const channelBytes = encodeChannel32(channel)
  const moodByte = new Uint8Array([mood & 0xff])
  const ws = new Uint8Array(8)
  new DataView(ws.buffer).setBigInt64(0, BigInt(windowStart), true)
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, channelBytes, moodByte, ws],
    getClientProgramId(),
  )
}

export function findEscrowPda(market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ESCROW_SEED, market.toBuffer()], getClientProgramId())
}

export function findPositionPda(market: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, market.toBuffer(), user.toBuffer()],
    getClientProgramId(),
  )
}

// Config account fields we care about on the client.
export interface ConfigAccount {
  oracle: PublicKey
  usdcMint: PublicKey
  feeRecipient: PublicKey
  feeBps: number
}

export async function fetchConfig(program: Program): Promise<ConfigAccount> {
  const [configPda] = findConfigPda()
  const raw = await (program.account as any).config.fetch(configPda)
  return {
    oracle: raw.oracle,
    usdcMint: raw.usdcMint,
    feeRecipient: raw.feeRecipient,
    feeBps: raw.feeBps,
  }
}

export interface ClientPosition {
  yesAmount: bigint
  noAmount: bigint
  claimed: boolean
}

export async function fetchPosition(
  program: Program,
  market: PublicKey,
  user: PublicKey,
): Promise<ClientPosition | null> {
  const [pda] = findPositionPda(market, user)
  try {
    const raw = await (program.account as any).position.fetch(pda)
    return {
      yesAmount: BigInt(raw.yesAmount.toString()),
      noAmount: BigInt(raw.noAmount.toString()),
      claimed: !!raw.claimed,
    }
  } catch {
    return null
  }
}

export { BN }
