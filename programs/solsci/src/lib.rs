use anchor_lang::prelude::*;

declare_id!("8cmvWB8SrFvS5fKjsCw4bme9iFVeFCFsbTPKdq9NykbH");

pub const MAX_METADATA_LEN: usize = 512;

#[program]
pub mod solsci {
    use super::*;

    /// Register a new scientific discovery on-chain.
    ///
    /// Creates a PDA keyed by `(researcher, file_hash)`. The registrant becomes
    /// both the original `researcher` (immutable) and the initial `owner`
    /// (transferable).
    pub fn register_discovery(
        ctx: Context<RegisterDiscovery>,
        file_hash: [u8; 32],
        metadata: String,
    ) -> Result<()> {
        require!(!metadata.is_empty(), SolSciError::MetadataEmpty);
        require!(metadata.len() <= MAX_METADATA_LEN, SolSciError::MetadataTooLong);

        let record = &mut ctx.accounts.discovery_record;
        record.researcher = ctx.accounts.researcher.key();
        record.owner      = ctx.accounts.researcher.key();
        record.file_hash  = file_hash;
        record.timestamp  = Clock::get()?.unix_timestamp;
        record.bump       = ctx.bumps.discovery_record;
        record.metadata   = metadata;

        emit!(DiscoveryRegistered {
            researcher:     record.researcher,
            owner:          record.owner,
            file_hash:      record.file_hash,
            timestamp:      record.timestamp,
            metadata:       record.metadata.clone(),
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }

    /// Transfer ownership of a discovery to a new wallet.
    ///
    /// The original `researcher` field and `timestamp` are preserved forever —
    /// only `owner` changes. The current owner must sign.
    pub fn transfer_discovery(
        ctx: Context<TransferDiscovery>,
        _file_hash: [u8; 32],
    ) -> Result<()> {
        let certificate_id = ctx.accounts.discovery_record.key();
        let prev_owner     = ctx.accounts.discovery_record.owner;
        let researcher     = ctx.accounts.discovery_record.researcher;
        let new_owner_key  = ctx.accounts.new_owner.key();

        ctx.accounts.discovery_record.owner = new_owner_key;

        emit!(DiscoveryTransferred {
            certificate_id,
            from:       prev_owner,
            to:         new_owner_key,
            researcher,
        });

        Ok(())
    }

    /// Verify an existing discovery record by emitting a `DiscoveryVerified` event.
    ///
    /// Read-only in effect — useful for CPI calls from other protocols.
    pub fn verify_discovery(
        ctx: Context<VerifyDiscovery>,
        _file_hash: [u8; 32],
    ) -> Result<()> {
        let record = &ctx.accounts.discovery_record;

        emit!(DiscoveryVerified {
            researcher:     record.researcher,
            owner:          record.owner,
            file_hash:      record.file_hash,
            timestamp:      record.timestamp,
            metadata:       record.metadata.clone(),
            certificate_id: ctx.accounts.discovery_record.key(),
        });

        Ok(())
    }

    /// Close a discovery record and return rent to the current owner.
    ///
    /// Only the current `owner` can close the record (not necessarily the
    /// original researcher after a transfer).
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
pub struct TransferDiscovery<'info> {
    /// Current owner — must sign the transfer.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Wallet receiving ownership.
    pub new_owner: SystemAccount<'info>,

    /// Original researcher — needed to re-derive the PDA seeds.
    pub researcher: SystemAccount<'info>,

    #[account(
        mut,
        seeds      = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump       = discovery_record.bump,
        constraint = discovery_record.owner == owner.key() @ SolSciError::NotOwner,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,
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
    /// Current owner receives the reclaimed rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Original researcher — needed to re-derive the PDA seeds.
    pub researcher: SystemAccount<'info>,

    #[account(
        mut,
        seeds      = [b"discovery", researcher.key().as_ref(), file_hash.as_ref()],
        bump       = discovery_record.bump,
        close      = owner,
        constraint = discovery_record.owner == owner.key() @ SolSciError::NotOwner,
    )]
    pub discovery_record: Account<'info, DiscoveryRecord>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct DiscoveryRecord {
    /// Original registrant — immutable, part of the PDA seeds.
    pub researcher: Pubkey,
    /// Current owner — may differ from researcher after a transfer.
    pub owner:      Pubkey,
    pub file_hash:  [u8; 32],
    pub timestamp:  i64,
    #[max_len(512)]
    pub metadata:   String,
    pub bump:       u8,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct DiscoveryRegistered {
    pub researcher:     Pubkey,
    pub owner:          Pubkey,
    pub file_hash:      [u8; 32],
    pub timestamp:      i64,
    pub metadata:       String,
    pub certificate_id: Pubkey,
}

#[event]
pub struct DiscoveryTransferred {
    pub certificate_id: Pubkey,
    pub from:           Pubkey,
    pub to:             Pubkey,
    pub researcher:     Pubkey,
}

#[event]
pub struct DiscoveryVerified {
    pub researcher:     Pubkey,
    pub owner:          Pubkey,
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
    #[msg("Only the current owner can perform this action")]
    NotOwner,
}
