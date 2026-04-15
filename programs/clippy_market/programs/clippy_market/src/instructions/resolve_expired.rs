use anchor_lang::prelude::*;

use crate::errors::ClippyError;
use crate::state::{Config, Market, MarketState};

#[derive(Accounts)]
pub struct ResolveExpired<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.channel.as_ref(), &[market.mood], &market.window_start.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub payer: Signer<'info>,
}

pub fn run(ctx: Context<ResolveExpired>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, ClippyError::AlreadyResolved);
    let now = Clock::get()?.unix_timestamp;
    require!(now >= market.window_end, ClippyError::WindowNotEnded);
    market.state = MarketState::ResolvedNo;
    market.resolved_at = now;
    Ok(())
}
