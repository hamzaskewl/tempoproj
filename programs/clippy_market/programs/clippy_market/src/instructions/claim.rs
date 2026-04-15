use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::ClippyError;
use crate::state::{Config, Market, MarketState, Position};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [b"market", market.channel.as_ref(), &[market.mood], &market.window_start.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"escrow", market.key().as_ref()],
        bump = market.escrow_bump,
        token::mint = usdc_mint,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
    )]
    pub user_usdc: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = usdc_mint,
    )]
    pub fee_recipient_ata: Box<Account<'info, TokenAccount>>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
}

pub fn run(ctx: Context<Claim>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.state != MarketState::Open, ClippyError::NotResolved);

    let position = &mut ctx.accounts.position;
    require!(!position.claimed, ClippyError::AlreadyClaimed);
    require!(
        position.yes_amount > 0 || position.no_amount > 0,
        ClippyError::NoPosition
    );

    let (winning_stake, winning_pool, losing_pool) = match market.state {
        MarketState::ResolvedYes => (position.yes_amount, market.total_yes, market.total_no),
        MarketState::ResolvedNo => (position.no_amount, market.total_no, market.total_yes),
        MarketState::Open => unreachable!(),
    };

    // One-sided pool: refund the user's entire stake (both sides), no fee
    let (payout, fee_this_call) = if winning_pool == 0 || losing_pool == 0 {
        let refund = position
            .yes_amount
            .checked_add(position.no_amount)
            .ok_or(ClippyError::MathOverflow)?;
        (refund, 0u64)
    } else if winning_stake == 0 {
        // User bet only on losing side — payout is zero
        (0u64, 0u64)
    } else {
        let fee_bps = ctx.accounts.config.fee_bps as u128;
        let losing = losing_pool as u128;
        let total_fee = losing
            .checked_mul(fee_bps)
            .ok_or(ClippyError::MathOverflow)?
            / 10_000u128;
        let net_loser = losing.checked_sub(total_fee).ok_or(ClippyError::MathOverflow)?;
        // share = winning_stake / winning_pool * net_loser
        let share = (winning_stake as u128)
            .checked_mul(net_loser)
            .ok_or(ClippyError::MathOverflow)?
            / (winning_pool as u128);
        let user_payout = (winning_stake as u128)
            .checked_add(share)
            .ok_or(ClippyError::MathOverflow)?;
        let fee_to_pay = if market.fee_paid { 0u128 } else { total_fee };
        (user_payout as u64, fee_to_pay as u64)
    };

    // PDA signer for escrow
    let channel = market.channel;
    let mood = market.mood;
    let ws_bytes = market.window_start.to_le_bytes();
    let market_bump = market.bump;
    let seeds: &[&[u8]] = &[
        b"market",
        channel.as_ref(),
        std::slice::from_ref(&mood),
        ws_bytes.as_ref(),
        std::slice::from_ref(&market_bump),
    ];
    let signer_seeds = &[seeds];

    if payout > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;
    }

    if fee_this_call > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.fee_recipient_ata.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer_seeds,
            ),
            fee_this_call,
        )?;
        market.fee_paid = true;
    }

    position.claimed = true;
    Ok(())
}
