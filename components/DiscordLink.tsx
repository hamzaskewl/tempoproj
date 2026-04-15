export function DiscordLink({ size = 14 }: { size?: number }) {
  return (
    <a
      href="https://discord.gg/SGRBWsBXQ7"
      target="_blank"
      rel="noreferrer"
      className="text-[13px] font-semibold px-[12px] py-1 rounded-full bg-gradient-to-b from-[#bfc6ff] via-[#5865F2] to-[#bfc6ff] text-[#1a1b4b] border-[0.5px] border-[#5865F233] shadow-sm flex items-center gap-[5px] hover:scale-103 active:scale-97 transition-transform"
    >
      <svg width={size} height={size} viewBox="0 0 71 55" fill="currentColor">
        <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 010-.4c.4-.3.7-.6 1.1-.8a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.6.2.2 0 00-.1.4 47.2 47.2 0 003.6 5.8.2.2 0 00.3.1A58.7 58.7 0 0070.4 45.7v-.2c1.4-15-2.3-28.1-9.8-39.7a.2.2 0 00-.1 0zM23.7 37.3c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.1 6.3 7-2.8 7-6.3 7zm23.2 0c-3.4 0-6.3-3.2-6.3-7s2.8-7 6.3-7 6.4 3.1 6.3 7-2.8 7-6.3 7z" />
      </svg>
      discord
    </a>
  )
}
