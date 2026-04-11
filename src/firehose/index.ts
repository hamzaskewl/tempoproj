// Re-export everything from submodules
export type { ChatMessage, ChannelState, StreamContext } from './state.js'
export type { Vibe, VibeScores } from './state.js'
export {
  channels,
  setActiveChannel,
  removeActiveChannel,
  isActiveChannel,
  getOrCreateChannel,
} from './state.js'

export {
  getTrending,
  getChannel,
  getSpikes,
  getRecentMessages,
  isConnected,
  getStats,
} from './queries.js'

export {
  getStreamContext,
  getViewerCount,
  getStreamInfo,
  getVodTimestamp,
  getVodUrl,
  isStreamLive,
} from './stream.js'

export { onSpike } from './detector.js'
export { connectFirehose } from './connection.js'

// Import detector to ensure side effects (setInterval loops) run on module load
import './detector.js'
