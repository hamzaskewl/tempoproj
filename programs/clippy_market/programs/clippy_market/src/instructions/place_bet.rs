use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::ClippyError;
use crate::state::{Config, Market, MarketState, Position};

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.channel.as_ref(), &[market.mood], &market.window_start.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"escrow", market.key().as_ref()],
        bump = market.escrow_bump,
        token::mint = usdc_mint,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = Position::LEN,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn run(ctx: Context<PlaceBet>, side: u8, amount: u64) -> Result<()> {
    require!(amount > 0, ClippyError::ZeroAmount);
    require!(side == 0 || side == 1, ClippyError::InvalidSideByte);

    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, ClippyError::AlreadyResolved);
    let now = Clock::get()?.unix_timestamp;
    require!(now < market.window_end, ClippyError::WindowClosed);

    // SPL transfer: user_usdc -> escrow
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    // Upsert position
    let position = &mut ctx.accounts.position;
    if position.market == Pubkey::default() {
        position.market = market.key();
        position.user = ctx.accounts.user.key();
        position.yes_amount = 0;
        position.no_amount = 0;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    }

    if side == 1 {
        position.yes_amount = position
            .yes_amount
            .checked_add(amount)
            .ok_or(ClippyError::MathOverflow)?;
        market.total_yes = market
            .total_yes
            .checked_add(amount)
            .ok_or(ClippyError::MathOverflow)?;
    } else {
        position.no_amount = position
            .no_amount
            .checked_add(amount)
            .ok_or(ClippyError::MathOverflow)?;
        market.total_no = market
            .total_no
            .checked_add(amount)
            .ok_or(ClippyError::MathOverflow)?;
    }

    Ok(())
}
