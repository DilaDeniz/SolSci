use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name    = "solsci-engine",
    about   = "Hash analysis output files and register proofs on Solana",
    version
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Hash a file and register it as a discovery on-chain.
    Register(RegisterArgs),
    /// Verify that a discovery record exists on-chain.
    Verify(VerifyArgs),
}

#[derive(Args)]
pub struct RegisterArgs {
    /// Path to the analysis output file to hash and register.
    #[arg(short, long)]
    pub file: PathBuf,

    /// Analysis type label stored in metadata.
    #[arg(short, long, default_value = "genomic_analysis")]
    pub analysis_type: String,

    /// Tool identifier in "Name/Version" format (e.g. "BioFastq-A/1.0.0").
    #[arg(long, default_value = "BioFastq-A/1.0.0")]
    pub tool_version: String,

    /// Solana RPC endpoint.
    #[arg(long, default_value = "https://api.devnet.solana.com")]
    pub rpc_url: String,

    /// Path to the Solana keypair file used as the researcher wallet.
    #[arg(long, default_value = "~/.config/solana/id.json")]
    pub keypair: PathBuf,

    /// Deployed SolSci program ID.
    #[arg(long)]
    pub program_id: String,

    /// Print the hash and metadata without submitting to Solana.
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Args)]
pub struct VerifyArgs {
    /// SHA-256 hash of the file to look up (64-character hex string).
    #[arg(long)]
    pub hash: String,

    /// Researcher wallet address that registered the discovery.
    #[arg(long)]
    pub researcher: String,

    /// Solana RPC endpoint.
    #[arg(long, default_value = "https://api.devnet.solana.com")]
    pub rpc_url: String,

    /// Deployed SolSci program ID.
    #[arg(long)]
    pub program_id: String,
}
