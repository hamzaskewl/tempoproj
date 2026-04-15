use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as IX_SYSVAR_ID;

use crate::ed25519::extract_ed25519_data;
use crate::errors::ClippyError;
use crate::state::{build_attestation_message, Config, Market, MarketState};

#[derive(Accounts)]
pub struct ResolveWithReport<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.channel.as_ref(), &[market.mood], &market.window_start.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub payer: Signer<'info>,

    /// CHECK: address-checked to the instructions sysvar
    #[account(address = IX_SYSVAR_ID)]
    pub ix_sysvar: UncheckedAccount<'info>,
}

pub fn run(ctx: Context<ResolveWithReport>, ed25519_ix_index: u8) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, ClippyError::AlreadyResolved);

    let mut pubkey_buf = [0u8; 32];
    let mut msg_buf: Vec<u8> = Vec::with_capacity(66);
    extract_ed25519_data(
        &ctx.accounts.ix_sysvar.to_account_info(),
        ed25519_ix_index as usize,
        &mut pubkey_buf,
        &mut msg_buf,
    )?;

    // Oracle pubkey must match config
    require!(
        pubkey_buf == ctx.accounts.config.oracle.to_bytes(),
        ClippyError::OracleMismatch
    );

    // Recompute expected message and compare
    let expected = build_attestation_message(
        &market.channel,
        market.mood,
        market.window_start,
        market.window_end,
    );
    require!(msg_buf.as_slice() == expected.as_slice(), ClippyError::MessageMismatch);

    market.state = MarketState::ResolvedYes;
    market.resolved_at = Clock::get()?.unix_timestamp;
    Ok(())
}
