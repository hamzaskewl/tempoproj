import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  Ed25519Program,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { AnchorProvider, Program, Wallet, BN, Idl } from '@coral-xyz/anchor'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import idl from './idl/clippy_market.json' with { type: 'json' }
import { loadOracleKeypair } from './keypair'
import { encodeChannel32 } from './moods'
import type { SignedAttestation } from './sign'

const IDL = idl as Idl
const MARKET_SEED = Buffer.from('market', 'ascii')
const POSITION_SEED = Buffer.from('position', 'ascii')
const CONFIG_SEED = Buffer.from('config', 'ascii')
const ESCROW_SEED = Buffer.from('escrow', 'ascii')

export function getProgramId(): PublicKey {
  const id = process.env.CLIPPY_PROGRAM_ID
  if (!id) throw new Error('CLIPPY_PROGRAM_ID not set')
  return new PublicKey(id)
}

export function getUsdcMint(): PublicKey {
  const m = process.env.USDC_MINT
  if (!m) throw new Error('USDC_MINT not set')
  return new PublicKey(m)
}

export function getConnection(): Connection {
  const key = process.env.HELIUS_KEY
  if (!key) throw new Error('HELIUS_KEY not set')
  return new Connection(`https://devnet.helius-rpc.com/?api-key=${key}`, 'confirmed')
}

// Wallet adapter around a Keypair (Anchor needs this interface to build Provider).
class KeypairWallet implements Wallet {
  constructor(public payer: Keypair) {}
  get publicKey(): PublicKey { return this.payer.publicKey }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.payer])
    } else {
      (tx as Transaction).partialSign(this.payer)
    }
    return tx
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) await this.signTransaction(tx)
    return txs
  }
}

let cachedProgram: Program | null = null

export function getOracleProgram(): { program: Program; provider: AnchorProvider; oracle: Keypair } {
  if (cachedProgram) {
    const provider = cachedProgram.provider as AnchorProvider
    return { program: cachedProgram, provider, oracle: (provider.wallet as KeypairWallet).payer }
  }
  const oracle = loadOracleKeypair()
  const connection = getConnection()
  const wallet = new KeypairWallet(oracle)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed', preflightCommitment: 'confirmed' })
  // Anchor 0.30: Program ctor reads address from IDL, but we override via env just in case.
  const idlWithAddress: Idl = { ...IDL, address: getProgramId().toBase58() } as Idl
  const program = new Program(idlWithAddress, provider)
  cachedProgram = program
  return { program, provider, oracle }
}

// ---- PDA helpers ---------------------------------------------------------

export function findConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], getProgramId())
}

// seeds: [b"market", channel[32], mood_u8, window_start_i64_le]
export function findMarketPda(channel: string, mood: number, windowStart: number | bigint): [PublicKey, number] {
  const channelBytes = encodeChannel32(channel)
  const moodByte = Buffer.from([mood & 0xff])
  const ws = Buffer.alloc(8)
  ws.writeBigInt64LE(BigInt(windowStart), 0)
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, channelBytes, moodByte, ws],
    getProgramId(),
  )
}

export function findEscrowPda(market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ESCROW_SEED, market.toBuffer()], getProgramId())
}

export function findPositionPda(market: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, market.toBuffer(), user.toBuffer()],
    getProgramId(),
  )
}

// ---- Tx builders ---------------------------------------------------------

export async function createMarketIx(
  channel: string,
  mood: number,
  windowStart: number,
  windowEnd: number,
): Promise<{ ix: TransactionInstruction; market: PublicKey }> {
  const { program, oracle } = getOracleProgram()
  const [market] = findMarketPda(channel, mood, windowStart)
  const [escrow] = findEscrowPda(market)
  const channelBuf = encodeChannel32(channel)

  const ix = await (program.methods as any)
    .createMarket(Array.from(channelBuf), mood, new BN(windowStart), new BN(windowEnd))
    .accounts({
      authority: oracle.publicKey,
      market,
      escrow,
      usdcMint: getUsdcMint(),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction()
  return { ix, market }
}

export async function resolveWithReportIxs(
  market: PublicKey,
  attestation: SignedAttestation,
): Promise<TransactionInstruction[]> {
  const { program, oracle } = getOracleProgram()
  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: attestation.publicKey,
    message: attestation.message,
    signature: attestation.signature,
  })
  // The ed25519 instruction sits at index 0; the resolve ix reads it via sysvar.
  const resolveIx = await (program.methods as any)
    .resolveWithReport(0)
    .accounts({
      market,
      payer: oracle.publicKey,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction()
  return [ed25519Ix, resolveIx]
}

export async function sendOracleTx(ixs: TransactionInstruction[]): Promise<string> {
  const { provider, oracle } = getOracleProgram()
  const tx = new Transaction().add(...ixs)
  const sig = await sendAndConfirmTransaction(provider.connection, tx, [oracle], {
    commitment: 'confirmed',
  })
  return sig
}

// ---- Account fetchers ----------------------------------------------------

export interface MarketAccount {
  pda: PublicKey
  channel: string
  mood: number
  windowStart: number
  windowEnd: number
  totalYes: bigint
  totalNo: bigint
  state: 'open' | 'yes' | 'no'
  resolvedAt: number
  escrow: PublicKey
}

function decodeChannelArray(arr: number[] | Uint8Array): string {
  const buf = Buffer.from(arr as any)
  const end = buf.indexOf(0)
  return buf.subarray(0, end < 0 ? buf.length : end).toString('ascii')
}

function decodeState(state: any): 'open' | 'yes' | 'no' {
  if (!state || typeof state !== 'object') return 'open'
  if ('open' in state) return 'open'
  if ('resolvedYes' in state) return 'yes'
  if ('resolvedNo' in state) return 'no'
  return 'open'
}

function mapMarket(pda: PublicKey, raw: any): MarketAccount {
  return {
    pda,
    channel: decodeChannelArray(raw.channel),
    mood: raw.mood,
    windowStart: Number(raw.windowStart),
    windowEnd: Number(raw.windowEnd),
    totalYes: BigInt(raw.totalYes.toString()),
    totalNo: BigInt(raw.totalNo.toString()),
    state: decodeState(raw.state),
    resolvedAt: Number(raw.resolvedAt),
    escrow: raw.escrow,
  }
}

export async function fetchMarket(pda: PublicKey): Promise<MarketAccount | null> {
  const { program } = getOracleProgram()
  try {
    const raw = await (program.account as any).market.fetch(pda)
    return mapMarket(pda, raw)
  } catch {
    return null
  }
}

export async function fetchAllMarkets(): Promise<MarketAccount[]> {
  const { program } = getOracleProgram()
  const rows = await (program.account as any).market.all()
  return rows.map((r: any) => mapMarket(r.publicKey, r.account))
}

export async function fetchOpenMarkets(): Promise<MarketAccount[]> {
  const all = await fetchAllMarkets()
  return all.filter((m) => m.state === 'open')
}
