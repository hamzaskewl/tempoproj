use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: fee recipient is just a pubkey store; ATA ownership checked at claim time
    pub fee_recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn run(
    ctx: Context<Initialize>,
    oracle: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.authority = ctx.accounts.authority.key();
    cfg.oracle = oracle;
    cfg.usdc_mint = ctx.accounts.usdc_mint.key();
    cfg.fee_recipient = ctx.accounts.fee_recipient.key();
    cfg.fee_bps = fee_bps;
    cfg.bump = ctx.bumps.config;
    Ok(())
}
