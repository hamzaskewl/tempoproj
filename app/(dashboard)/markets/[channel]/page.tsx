import { ChannelSplitView } from './ChannelSplitView'

export default async function ChannelMarketsPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel } = await params
  return <ChannelSplitView channel={channel} />
}
