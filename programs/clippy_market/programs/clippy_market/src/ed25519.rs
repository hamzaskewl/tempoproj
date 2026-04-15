use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_instruction_at_checked, ID as IX_SYSVAR_ID,
};

use crate::errors::ClippyError;

/// Ed25519 native program id: `Ed25519SigVerify111111111111111111111111111`.
pub const ED25519_PROGRAM_ID: Pubkey = anchor_lang::pubkey!("Ed25519SigVerify111111111111111111111111111");

/// Layout of an Ed25519 sigverify instruction data, for a single signature:
/// ref: https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
///
/// offset  size  description
/// 0       1     num_signatures (= 1)
/// 1       1     padding
/// 2       2     signature_offset (u16 LE)
/// 4       2     signature_instruction_index (u16 LE)
/// 6       2     public_key_offset (u16 LE)
/// 8       2     public_key_instruction_index (u16 LE)
/// 10      2     message_data_offset (u16 LE)
/// 12      2     message_data_size (u16 LE)
/// 14      2     message_instruction_index (u16 LE)
/// 16      32    public_key
/// 48      64    signature
/// 112     N     message
pub struct VerifiedSig<'a> {
    pub pubkey: &'a [u8],
    pub message: &'a [u8],
}

/// Read the instruction at `index` in the current tx, verify it's an Ed25519Program
/// instruction with exactly one signature, and return the signed pubkey + message bytes.
///
/// Callers must verify that this index immediately precedes the current program instruction
/// (i.e. it is not arbitrary tx data).
pub fn extract_ed25519_data<'a>(
    ix_sysvar: &'a AccountInfo,
    index: usize,
    out_pubkey: &mut [u8; 32],
    out_message: &mut Vec<u8>,
) -> Result<()> {
    require_keys_eq!(*ix_sysvar.key, IX_SYSVAR_ID, ClippyError::NotEd25519Instruction);
    let ix = load_instruction_at_checked(index, ix_sysvar)
        .map_err(|_| error!(ClippyError::NotEd25519Instruction))?;

    require_keys_eq!(ix.program_id, ED25519_PROGRAM_ID, ClippyError::NotEd25519Instruction);

    let data = ix.data;
    if data.len() < 16 {
        return err!(ClippyError::MalformedEd25519Data);
    }
    let num_sigs = data[0];
    if num_sigs != 1 {
        return err!(ClippyError::WrongSignatureCount);
    }

    let u16_le = |o: usize| -> Result<usize> {
        if o + 2 > data.len() {
            return err!(ClippyError::MalformedEd25519Data);
        }
        Ok(u16::from_le_bytes([data[o], data[o + 1]]) as usize)
    };

    let sig_off = u16_le(2)?;
    let sig_ix_idx = u16_le(4)?;
    let pk_off = u16_le(6)?;
    let pk_ix_idx = u16_le(8)?;
    let msg_off = u16_le(10)?;
    let msg_size = u16_le(12)?;
    let msg_ix_idx = u16_le(14)?;

    // We require all data to live in the sigverify ix itself (idx = u16::MAX marker or same ix).
    // Convention: when data is embedded, instruction_index = u16::MAX (0xFFFF).
    const SELF: usize = 0xFFFF;
    if sig_ix_idx != SELF || pk_ix_idx != SELF || msg_ix_idx != SELF {
        return err!(ClippyError::MalformedEd25519Data);
    }

    if pk_off + 32 > data.len() || sig_off + 64 > data.len() || msg_off + msg_size > data.len() {
        return err!(ClippyError::MalformedEd25519Data);
    }

    out_pubkey.copy_from_slice(&data[pk_off..pk_off + 32]);
    out_message.clear();
    out_message.extend_from_slice(&data[msg_off..msg_off + msg_size]);
    Ok(())
}
