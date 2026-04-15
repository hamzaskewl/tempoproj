// Re-export everything from submodules
export type { ChatMessage, ChannelState, StreamContext } from './state'
export type { Vibe, VibeScores } from './state'
export {
  channels,
  setActiveChannel,
  removeActiveChannel,
  isActiveChannel,
  getOrCreateChannel,
} from './state'

export {
  getTrending,
  getChannel,
  getSpikes,
  getRecentMessages,
  isConnected,
  getStats,
} from './queries'

export {
  getStreamContext,
  getViewerCount,
  getStreamInfo,
  getVodTimestamp,
  getVodUrl,
  isStreamLive,
} from './stream'

export { onSpike } from './detector'
export { connectFirehose } from './connection'

// Import detector to ensure side effects (setInterval loops) run on module load
import './detector'
