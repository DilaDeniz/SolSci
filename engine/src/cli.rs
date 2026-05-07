use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name    = "solsci-engine",
    about   = "Hash research output files and register proofs on Solana",
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
    /// Path to the research output file to hash and register.
    #[arg(short, long)]
    pub file: PathBuf,

    /// Research type label stored in metadata (e.g. machine_learning, astrophysics).
    #[arg(short, long, default_value = "experiment")]
    pub analysis_type: String,

    /// Tool or software used to produce this file (e.g. Python, MATLAB, R).
    #[arg(long, default_value = "")]
    pub tool: String,

    /// Tool version string (e.g. 3.11.0).
    #[arg(long, default_value = "")]
    pub version: String,

    /// One-sentence description of what this file contains.
    #[arg(long, default_value = "")]
    pub description: String,

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
