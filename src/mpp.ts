import { Mppx, tempo } from 'mppx/nextjs'
import { createClient, http } from 'viem'
import { tempo as tempoChain } from 'viem/chains'
import crypto from 'crypto'

const WALLET = process.env.WALLET_ADDRESS || '0xfaad4f22fc6259646c8925203a04020e5458da6d'
const USDC = '0x20c000000000000000000000b9537d11c60e8b50'

const client = createClient({
  chain: tempoChain,
  transport: http(process.env.TEMPO_RPC || 'https://rpc.tempo.xyz'),
})

const secretKey = process.env.PAYMENT_SECRET || crypto.randomBytes(32).toString('hex')

export const mppx = Mppx.create({
  methods: [
    tempo({
      currency: USDC,
      recipient: WALLET as `0x${string}`,
      getClient: () => client,
      sse: true,
    }),
  ],
  secretKey,
  realm: 'clippy.live',
})
