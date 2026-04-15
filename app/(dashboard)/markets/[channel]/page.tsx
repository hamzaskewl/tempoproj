import { MarketsList } from '../components/MarketsList'

export default async function ChannelMarketsPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel } = await params
  return <MarketsList channel={channel} />
}
