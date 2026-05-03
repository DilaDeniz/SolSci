use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const MAX_METADATA_LEN: usize = 512;

#[program]
pub mod solsci {
    use super::*;

    /// Register a new scientific discovery on-chain.
    ///
    /// Creates a PDA keyed by `(researcher, file_hash)` so the same researcher
    /// cannot overwrite an existing record for the same file hash.
    pub fn register_discovery(
        ctx: Context<RegisterDiscovery>,
        file_hash: [u8; 32],
        metadata: String,
    ) -> Result<()> {
        require!(!metadata.is_empty(), SolSciError::MetadataEmpty);
        require!(metadata.len() <= MAX_METADATA_LEN, SolSciError::MetadataTooLong);

        let record = &mut ctx.accounts.discovery_record;
        record.researcher = ctx.accounts.researcher.key();
        record.file_hash  = file_hash;
        record.timestamp  = Clock::get()?.unix_timestamp;
        record.bump       = ctx.bumps.discovery_record;
        record.metadata   = metadata;

        emit!(DiscoveryRegistered {
            researcher:     record.researcher,
            file_hash:      record.file_hash,
            timestamp:      record.timestamp,
            metadata:       record.metadata.clone(),
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }

    /// Verify an existing discovery record by emitting a `DiscoveryVerified` event.
    ///
    /// Read-only in effect — useful for CPI calls from other protocols that need
    /// to assert a discovery exists without fetching the account themselves.
    pub fn verify_discovery(
        ctx: Context<VerifyDiscovery>,
        _file_hash: [u8; 32],
    ) -> Result<()> {
        let record = &ctx.accounts.discovery_record;

        emit!(DiscoveryVerified {
            researcher:     record.researcher,
            file_hash:      record.file_hash,
            timestamp:      record.timestamp,
            metadata:       record.metadata.clone(),
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }

    /// Close a discovery record and return the rent lamports to the researcher.
    ///
    /// Only the original researcher can close their own record. The `close`
    /// constraint handles the lamport transfer automatically.
    pub fn close_discovery(
        _ctx: Context<CloseDiscovery>,
        _file_hash: [u8; 32],
    ) -> Result<()> {
        Ok(())
    }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32])]
pub struct RegisterDiscovery<'info> {
    #[account(mut)]
    pub researcher: Signer<'info>,

    #[account(
        init,
        payer  = researcher,
        space  = 8 + DiscoveryRecord::INIT_SPACE,
        seeds  = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32])]
pub struct VerifyDiscovery<'info> {
    pub researcher: SystemAccount<'info>,

    #[account(
        seeds = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump  = discovery_record.bump,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,
}

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32])]
pub struct CloseDiscovery<'info> {
    #[account(mut)]
    pub researcher: Signer<'info>,

    #[account(
        mut,
        seeds  = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump   = discovery_record.bump,
        close  = researcher,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct DiscoveryRecord {
    pub researcher: Pubkey,
    pub file_hash:  [u8; 32],
    pub timestamp:  i64,
    #[max_len(512)]
    pub metadata:   String,
    /// Stored for cheap PDA re-derivation in CPI callers.
    pub bump:       u8,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct DiscoveryRegistered {
    #[index]
    pub researcher:     Pubkey,
    pub file_hash:      [u8; 32],
    pub timestamp:      i64,
    pub metadata:       String,
    pub certificate_id: Pubkey,
}

#[event]
pub struct DiscoveryVerified {
    #[index]
    pub researcher:     Pubkey,
    pub file_hash:      [u8; 32],
    pub timestamp:      i64,
    pub metadata:       String,
    pub certificate_id: Pubkey,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum SolSciError {
    #[msg("Metadata string exceeds the 512-byte limit")]
    MetadataTooLong,
    #[msg("Metadata must not be empty")]
    MetadataEmpty,
}
