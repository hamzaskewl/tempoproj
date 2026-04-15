use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::ClippyError;
use crate::state::{Config, Market, MarketState, CHANNEL_LEN, MAX_MOOD};

#[derive(Accounts)]
#[instruction(channel: [u8; CHANNEL_LEN], mood: u8, window_start: i64, window_end: i64)]
pub struct CreateMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        address = config.authority,
    )]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Market::LEN,
        seeds = [b"market", channel.as_ref(), &[mood], &window_start.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = authority,
        seeds = [b"escrow", market.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = market,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn run(
    ctx: Context<CreateMarket>,
    channel: [u8; CHANNEL_LEN],
    mood: u8,
    window_start: i64,
    window_end: i64,
) -> Result<()> {
    require!(mood <= MAX_MOOD, ClippyError::InvalidMood);
    require!(window_end > window_start, ClippyError::InvalidWindow);

    let market = &mut ctx.accounts.market;
    market.channel = channel;
    market.mood = mood;
    market.window_start = window_start;
    market.window_end = window_end;
    market.total_yes = 0;
    market.total_no = 0;
    market.state = MarketState::Open;
    market.resolved_at = 0;
    market.escrow = ctx.accounts.escrow.key();
    market.fee_paid = false;
    market.bump = ctx.bumps.market;
    market.escrow_bump = ctx.bumps.escrow;
    Ok(())
}
