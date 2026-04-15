import { ensureStarted } from '@/lib/server-init'
import { PublicKey } from '@solana/web3.js'

export async function GET(_req: Request, ctx: { params: Promise<{ pubkey: string }> }) {
  ensureStarted()
  const { pubkey } = await ctx.params

  let pda: PublicKey
  try {
    pda = new PublicKey(pubkey)
  } catch {
    return Response.json({ error: 'invalid pubkey' }, { status: 400 })
  }

  try {
    const { fetchMarket } = await import('@/src/oracle/client')
    const { getOracleProgram } = await import('@/src/oracle/client')
    const market = await fetchMarket(pda)
    if (!market) return Response.json({ error: 'market not found' }, { status: 404 })

    // Decode all positions for this market via getProgramAccounts memcmp.
    const { program } = getOracleProgram()
    let positions: any[] = []
    try {
      const rows = await (program.account as any).position.all([
        { memcmp: { offset: 8, bytes: pda.toBase58() } }, // first field after 8-byte discriminator is `market: Pubkey`
      ])
      positions = rows.map((r: any) => ({
        pda: r.publicKey.toBase58(),
        user: r.account.user.toBase58(),
        yesAmount: r.account.yesAmount.toString(),
        noAmount: r.account.noAmount.toString(),
        claimed: !!r.account.claimed,
      }))
    } catch (err: any) {
      console.error('[api/markets/[pubkey]] position fetch failed:', err?.message || err)
    }

    return Response.json({
      pda: market.pda.toBase58(),
      channel: market.channel,
      mood: market.mood,
      windowStart: market.windowStart,
      windowEnd: market.windowEnd,
      totalYes: market.totalYes.toString(),
      totalNo: market.totalNo.toString(),
      state: market.state,
      resolvedAt: market.resolvedAt,
      escrow: market.escrow.toBase58(),
      positions,
    })
  } catch (err: any) {
    return Response.json({ error: err?.message || 'internal error' }, { status: 500 })
  }
}
