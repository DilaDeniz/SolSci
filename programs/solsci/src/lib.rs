use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ── Constants ──────────────────────────────────────────────────────────────────

/// Maximum length of the metadata JSON string stored on-chain.
pub const MAX_METADATA_LEN: usize = 512;

/// Discriminator (8) + researcher pubkey (32) + file_hash (32) + timestamp (8)
/// + metadata string prefix (4) + metadata body (MAX_METADATA_LEN) + bump (1)
pub const DISCOVERY_ACCOUNT_SIZE: usize =
    8 + 32 + 32 + 8 + 4 + MAX_METADATA_LEN + 1;

// ── Program ───────────────────────────────────────────────────────────────────

#[program]
pub mod solsci {
    use super::*;

    /// Register a new scientific discovery on-chain.
    ///
    /// Creates a PDA account keyed by (researcher, file_hash) so the same
    /// researcher cannot overwrite an existing registration for the same hash.
    /// The caller provides:
    ///   - `file_hash`  — SHA-256 of the processed output (32 bytes)
    ///   - `metadata`   — JSON string with tool version, analysis type, file
    ///                    size, etc. (≤ 512 bytes)
    ///
    /// On success the account is written and a `DiscoveryRegistered` event is
    /// emitted so off-chain indexers can track registrations without scanning
    /// every account.
    pub fn register_discovery(
        ctx: Context<RegisterDiscovery>,
        file_hash: [u8; 32],
        metadata: String,
    ) -> Result<()> {
        require!(
            metadata.len() <= MAX_METADATA_LEN,
            SolSciError::MetadataTooLong
        );
        require!(!metadata.is_empty(), SolSciError::MetadataEmpty);

        let record = &mut ctx.accounts.discovery_record;
        let researcher = ctx.accounts.researcher.key();
        let clock = Clock::get()?;

        record.researcher = researcher;
        record.file_hash = file_hash;
        record.timestamp = clock.unix_timestamp;
        record.metadata = metadata.clone();
        record.bump = ctx.bumps.discovery_record;

        emit!(DiscoveryRegistered {
            researcher,
            file_hash,
            timestamp: clock.unix_timestamp,
            metadata,
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }

    /// Verify an existing discovery record.
    ///
    /// A read-only instruction that validates the PDA is properly initialised
    /// and re-emits a `DiscoveryVerified` event carrying the stored data.
    /// Useful for client-side verification flows and on-chain CPI calls from
    /// other protocols that want to assert a discovery exists.
    pub fn verify_discovery(
        ctx: Context<VerifyDiscovery>,
        _file_hash: [u8; 32],
    ) -> Result<()> {
        let record = &ctx.accounts.discovery_record;

        emit!(DiscoveryVerified {
            researcher: record.researcher,
            file_hash: record.file_hash,
            timestamp: record.timestamp,
            metadata: record.metadata.clone(),
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32])]
pub struct RegisterDiscovery<'info> {
    /// The researcher claiming the discovery. Signs and pays for rent.
    #[account(mut)]
    pub researcher: Signer<'info>,

    /// PDA record account. Seeds bind it to (researcher, file_hash), making
    /// each (researcher × hash) pair unique and non-overwritable.
    #[account(
        init,
        payer = researcher,
        space = DISCOVERY_ACCOUNT_SIZE,
        seeds = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32])]
pub struct VerifyDiscovery<'info> {
    /// The researcher whose record we are verifying (used to derive the PDA).
    pub researcher: SystemAccount<'info>,

    /// The PDA record. Anchor verifies the seeds match, so if this account
    /// exists and deserialises correctly the discovery is authentic.
    #[account(
        seeds = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump = discovery_record.bump,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,
}

// ── State ─────────────────────────────────────────────────────────────────────

/// On-chain record of a single scientific discovery registration.
#[account]
#[derive(Debug)]
pub struct DiscoveryRecord {
    /// Solana wallet that registered the discovery.
    pub researcher: Pubkey,
    /// SHA-256 hash of the processed scientific output (e.g. FASTQ result).
    pub file_hash: [u8; 32],
    /// Unix timestamp of the block in which this was registered.
    pub timestamp: i64,
    /// JSON metadata: tool version, analysis type, file size, etc.
    pub metadata: String,
    /// PDA bump seed — stored for efficient re-derivation in verify CPI calls.
    pub bump: u8,
}

// ── Events ────────────────────────────────────────────────────────────────────

/// Emitted when a new discovery is registered. Indexed by off-chain services
/// to build the global SolSci discovery ledger.
#[event]
pub struct DiscoveryRegistered {
    #[index]
    pub researcher: Pubkey,
    pub file_hash: [u8; 32],
    pub timestamp: i64,
    pub metadata: String,
    /// The PDA address that serves as the permanent certificate ID.
    pub certificate_id: Pubkey,
}

/// Emitted when a discovery record is successfully verified on-chain.
#[event]
pub struct DiscoveryVerified {
    #[index]
    pub researcher: Pubkey,
    pub file_hash: [u8; 32],
    pub timestamp: i64,
    pub metadata: String,
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
