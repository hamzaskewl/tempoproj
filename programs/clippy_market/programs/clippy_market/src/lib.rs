use anchor_lang::prelude::*;

pub mod ed25519;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::CHANNEL_LEN;

declare_id!("AD4AzpCgbzkgXcxBFzWXzoXoFbztTTDCYCmYVZPXqe9W");

#[program]
pub mod clippy_market {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, oracle: Pubkey, fee_bps: u16) -> Result<()> {
        instructions::initialize::run(ctx, oracle, fee_bps)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        channel: [u8; CHANNEL_LEN],
        mood: u8,
        window_start: i64,
        window_end: i64,
    ) -> Result<()> {
        instructions::create_market::run(ctx, channel, mood, window_start, window_end)
    }

    pub fn place_bet(ctx: Context<PlaceBet>, side: u8, amount: u64) -> Result<()> {
        instructions::place_bet::run(ctx, side, amount)
    }

    pub fn resolve_with_report(
        ctx: Context<ResolveWithReport>,
        ed25519_ix_index: u8,
    ) -> Result<()> {
        instructions::resolve_with_report::run(ctx, ed25519_ix_index)
    }

    pub fn resolve_expired(ctx: Context<ResolveExpired>) -> Result<()> {
        instructions::resolve_expired::run(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::run(ctx)
    }
}
