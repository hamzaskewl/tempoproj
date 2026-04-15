use anchor_lang::prelude::*;

#[error_code]
pub enum ClippyError {
    #[msg("Betting window has closed")]
    WindowClosed,
    #[msg("Betting window not yet ended")]
    WindowNotEnded,
    #[msg("Market already resolved")]
    AlreadyResolved,
    #[msg("Market not resolved")]
    NotResolved,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Oracle pubkey mismatch")]
    OracleMismatch,
    #[msg("Attestation message mismatch")]
    MessageMismatch,
    #[msg("User has no position in this market")]
    NoPosition,
    #[msg("Invalid mood value")]
    InvalidMood,
    #[msg("Invalid side byte (must be 0 for NO or 1 for YES)")]
    InvalidSideByte,
    #[msg("Channel string too long (max 32 bytes)")]
    ChannelTooLong,
    #[msg("Window bounds invalid")]
    InvalidWindow,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Preceding instruction is not Ed25519Program")]
    NotEd25519Instruction,
    #[msg("Ed25519 instruction data malformed")]
    MalformedEd25519Data,
    #[msg("Expected exactly one Ed25519 signature")]
    WrongSignatureCount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
