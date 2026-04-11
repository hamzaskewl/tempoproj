import { getStats } from '@/src/firehose'

export async function GET() {
  const stats = getStats()
  return Response.json({
    service: 'Clippy',
    description: 'Real-time Twitch stream intelligence. Detects chat spikes, classifies moments with AI, auto-clips highlights.',
    version: '3.0.0',
    status: stats.connected ? 'live' : 'connecting',
    ...stats,
    llms_txt: '/llms.txt',
    docs: '/docs',
    endpoints: {
      free: {
        'GET /api/health': 'Status check',
        'GET /api/trending': 'Top 10 channels by burst rate',
        'GET /api/alerts': 'SSE spike feed. ?channel=name to filter',
        'GET /api/moments/:id': 'Get a moment by ID',
        'GET /api/moments/latest/:channel': 'Latest moment for a channel',
      },
      authenticated: {
        'GET /api/channel-stats/:name': 'Live channel rates + vibes',
        'POST /api/track/:channel': 'Add channel to tracking',
        'DELETE /api/track/:channel': 'Remove from tracking',
        'POST /api/my/channels': 'Add a channel to your slots (max 3)',
        'DELETE /api/my/channels/:channel': 'Remove channel from your slots',
        'POST /api/my/channels/:channel/confirm': 'Confirm channel (must be live)',
      },
      paid_mpp: {
        'POST /api/trending': { price: '$0.001', description: 'Full trending list' },
        'POST /api/channel': { price: '$0.001', description: 'Channel stats + recent messages' },
        'POST /api/spikes': { price: '$0.002', description: 'All active spikes with VOD links' },
        'POST /api/summarize': { price: '$0.01', description: 'LLM summary of channel chat' },
        'POST /api/moments': { price: '$0.001', description: 'List captured moments' },
        'POST /api/watch/:channel': { price: '$0.03/spike', description: 'SSE stream with AI-classified spikes + auto-clipping' },
      },
    },
  })
}
