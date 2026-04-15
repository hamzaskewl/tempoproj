import Link from 'next/link'

export const metadata = { title: 'clippy — docs' }

function Endpoint({
  method,
  path,
  price,
  priceClass = '',
}: {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  price: string
  priceClass?: string
}) {
  const methodColor =
    method === 'GET' ? 'text-[#22c55e]' : method === 'POST' ? 'text-[#38bdf8]' : 'text-[#ef4444]'
  return (
    <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-center px-3 py-2 bg-[#111] border border-[#161616] rounded text-[14px] mb-1">
      <span className={`font-semibold ${methodColor}`}>{method}</span>
      <span className="text-[#ccc]">{path}</span>
      <span className={`text-right ${priceClass || 'text-[#555]'}`}>{price}</span>
    </div>
  )
}

function FlowStep({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3 text-[14px] text-[#888]">
      <div className="w-5 h-5 rounded-full bg-[#1a1a1a] text-[#666] flex items-center justify-center text-[12px] flex-shrink-0">
        {num}
      </div>
      <div>{children}</div>
    </div>
  )
}

const Tag = ({ kind, label }: { kind: 'twitch' | 'llm'; label: string }) => {
  const cls = {
    twitch: 'from-[#ddd6fe] via-[#a78bfa] to-[#ddd6fe] text-[#2e1065] border-[#a78bfa33]',
    llm: 'from-[#fde68a] via-[#fbbf24] to-[#fde68a] text-[#78350f] border-[#fbbf2433]',
  }[kind]
  return <span className={`inline-block text-[12px] font-semibold px-[10px] py-[2px] rounded-full bg-gradient-to-b border-[0.5px] shadow-sm mr-1 ${cls}`}>{label}</span>
}

export default function DocsPage() {
  return (
    <div className="max-w-[720px] mx-auto p-6 leading-[1.7]">
      <header className="flex justify-between items-baseline mb-10 border-b border-[#1a1a1a] pb-4">
        <h1 className="text-[18px] font-medium">
          <Link href="/" className="inline-flex items-center gap-2 hover:text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoclip.png" alt="" width={24} height={24} />
            clippy
          </Link>
        </h1>
        <nav>
          <Link href="/" className="text-[14px] text-[#555] hover:text-white ml-4">
            dashboard
          </Link>
          <Link href="/docs" className="text-[14px] text-white ml-4">
            docs
          </Link>
        </nav>
      </header>

      <div className="mb-10">
        <p className="text-[16px] text-[#999]">
          Real-time Twitch stream intelligence. Detects chat spikes, classifies moments with AI, and auto-clips highlights.
        </p>
        <p className="text-[15px] text-[#555] mt-1">Open API. Solana-settled prediction markets on stream moments.</p>
      </div>

      <h2 className="text-[16px] font-semibold text-white mt-8 mb-3">How it works</h2>

      <FlowStep num={1}>
        Firehose ingests chat from Twitch channels in real-time via websocket. Only watched channels get full tracking.
      </FlowStep>
      <FlowStep num={2}>
        Per-channel rate tracking (5s burst window, 30s baseline). Spike threshold scales with channel size — big streamers need less % jump.
      </FlowStep>
      <FlowStep num={3}>
        <Tag kind="llm" label="LLM" />
        On watched channels, Claude classifies the mood and describes what happened.
      </FlowStep>
      <FlowStep num={4}>
        <Tag kind="twitch" label="Twitch" />
        Every spike on a watched channel auto-creates a Twitch clip. The LLM description becomes the clip title.
      </FlowStep>
      <FlowStep num={5}>
        Every classified moment is reported on-chain to a Solana program that settles binary prediction markets trustlessly.
      </FlowStep>

      <hr className="border-0 border-t border-[#1a1a1a] my-10" />

      <h2 className="text-[16px] font-semibold text-white mt-8 mb-3">API endpoints</h2>

      <h3 className="text-[14px] font-medium text-[#888] uppercase tracking-wider mt-5 mb-2">Free</h3>
      <Endpoint method="GET" path="/api" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/health" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/trending" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/alerts" price="free SSE" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/moments/:id" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/moments/latest/:channel" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/moments/:id/classify" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/channel-stats/:name" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="GET" path="/api/clip/:id" price="free" priceClass="text-[#22c55e]" />

      <h3 className="text-[14px] font-medium text-[#888] uppercase tracking-wider mt-5 mb-2">POST</h3>
      <Endpoint method="POST" path="/api/trending" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/channel" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/spikes" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/summarize" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/moments" price="free" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/watch/:channel" price="SSE" priceClass="text-[#22c55e]" />
      <div className="text-[13px] text-[#555] px-3 py-2 bg-[#0d0d0d] border-l-2 border-[#333] my-2 rounded-r">
        Opens an SSE stream of AI-classified spikes for a channel. Auto-closes when the stream goes offline (~2 min after streamer ends).
      </div>

      <h3 className="text-[14px] font-medium text-[#888] uppercase tracking-wider mt-5 mb-2">Twitch auth + clips</h3>
      <Endpoint method="GET" path="/api/auth/twitch" price="OAuth" priceClass="text-[#22c55e]" />
      <Endpoint method="POST" path="/api/clip/:id" price="free" priceClass="text-[#22c55e]" />

      <hr className="border-0 border-t border-[#1a1a1a] my-10" />

      <h2 className="text-[16px] font-semibold text-white mt-8 mb-3">Stack</h2>
      <p className="text-[14px] text-[#555]">
        Twitch chat firehose → Next.js → Claude Haiku (mood classification) → Twitch Helix API (auto-clip) → Solana (prediction market settlement)
      </p>
    </div>
  )
}
