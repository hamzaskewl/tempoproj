'use client'

export function TwitchPlayer({ channel }: { channel: string }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <iframe
        src={`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&muted=false`}
        className="absolute inset-0 w-full h-full"
        allowFullScreen
        allow="autoplay; encrypted-media"
      />
    </div>
  )
}
