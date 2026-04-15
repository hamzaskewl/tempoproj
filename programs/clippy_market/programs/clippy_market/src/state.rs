use anchor_lang::prelude::*;

pub const ATTEST_DOMAIN: &[u8; 16] = b"clippy-attest-v1";
pub const ATTEST_MESSAGE_LEN: usize = 16 + 32 + 1 + 8 + 8 + 1; // 66
pub const CHANNEL_LEN: usize = 32;
pub const MAX_MOOD: u8 = 8;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub usdc_mint: Pubkey,
    pub fee_recipient: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 2 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MarketState {
    Open,
    ResolvedYes,
    ResolvedNo,
}

#[account]
pub struct Market {
    pub channel: [u8; CHANNEL_LEN],
    pub mood: u8,
    pub window_start: i64,
    pub window_end: i64,
    pub total_yes: u64,
    pub total_no: u64,
    pub state: MarketState,
    pub resolved_at: i64,
    pub escrow: Pubkey,
    pub fee_paid: bool,
    pub bump: u8,
    pub escrow_bump: u8,
}

impl Market {
    // 8 disc + 32 channel + 1 mood + 8 ws + 8 we + 8 ty + 8 tn + 1+1 enum + 8 resolved_at + 32 escrow + 1 fee_paid + 1 bump + 1 escrow_bump
    pub const LEN: usize = 8 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 8 + 32 + 1 + 1 + 1;
}

#[account]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

/// Encode a lowercase ASCII channel name into the fixed 32-byte buffer used in PDA seeds
/// and attestation messages. Returns the padded buffer.
pub fn encode_channel(channel: &str) -> Result<[u8; CHANNEL_LEN]> {
    let bytes = channel.as_bytes();
    if bytes.len() > CHANNEL_LEN {
        return err!(crate::errors::ClippyError::ChannelTooLong);
    }
    let mut out = [0u8; CHANNEL_LEN];
    out[..bytes.len()].copy_from_slice(bytes);
    Ok(out)
}

/// Build the canonical 66-byte attestation message:
/// domain(16) || channel(32) || mood(1) || window_start LE(8) || window_end LE(8) || fired=1(1)
pub fn build_attestation_message(
    channel: &[u8; CHANNEL_LEN],
    mood: u8,
    window_start: i64,
    window_end: i64,
) -> [u8; ATTEST_MESSAGE_LEN] {
    let mut msg = [0u8; ATTEST_MESSAGE_LEN];
    msg[0..16].copy_from_slice(ATTEST_DOMAIN);
    msg[16..48].copy_from_slice(channel);
    msg[48] = mood;
    msg[49..57].copy_from_slice(&window_start.to_le_bytes());
    msg[57..65].copy_from_slice(&window_end.to_le_bytes());
    msg[65] = 1;
    msg
}
