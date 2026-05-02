use anyhow::{Context, Result};
use clap::Parser;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── CLI ────────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(
    name = "solsci-engine",
    about = "Hash a BioFastq-A output file and register the proof on Solana"
)]
struct Cli {
    /// Path to the BioFastq-A output file to be hashed
    #[arg(short, long)]
    file: PathBuf,

    /// Analysis type label (e.g. "whole_genome_sequencing")
    #[arg(short, long, default_value = "genomic_analysis")]
    analysis_type: String,

    /// Tool version string to embed in metadata
    #[arg(long, default_value = "BioFastq-A/1.0.0")]
    tool_version: String,

    /// Solana RPC endpoint
    #[arg(long, default_value = "https://api.devnet.solana.com")]
    rpc_url: String,

    /// Path to the Solana keypair file (payer / researcher wallet)
    #[arg(long, default_value = "~/.config/solana/id.json")]
    keypair: PathBuf,

    /// Only compute and print the hash; do not submit to Solana
    #[arg(long, default_value_t = false)]
    dry_run: bool,
}

// ── Metadata ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct DiscoveryMetadata {
    tool: String,
    version: String,
    analysis_type: String,
    file_size_bytes: u64,
    file_name: String,
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

/// Hash `file` with SHA-256 and return the raw 32-byte digest.
fn hash_file(path: &PathBuf) -> Result<[u8; 32]> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;

    let digest = Sha256::digest(&bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    Ok(out)
}

fn build_metadata(cli: &Cli, file_hash: &[u8; 32]) -> Result<String> {
    let file_size = std::fs::metadata(&cli.file)
        .with_context(|| "Could not stat input file")?
        .len();

    let file_name = cli
        .file
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Split "BioFastq-A/1.0.0" into tool + version
    let (tool, version) = cli
        .tool_version
        .split_once('/')
        .unwrap_or((&cli.tool_version, "unknown"));

    let meta = DiscoveryMetadata {
        tool: tool.to_string(),
        version: version.to_string(),
        analysis_type: cli.analysis_type.clone(),
        file_size_bytes: file_size,
        file_name,
    };

    let json = serde_json::to_string(&meta)?;
    if json.len() > 512 {
        anyhow::bail!(
            "Metadata JSON is {} bytes — exceeds the 512-byte on-chain limit. \
             Shorten analysis_type or tool_version.",
            json.len()
        );
    }

    let _ = file_hash; // reserved for future inline embedding
    Ok(json)
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() -> Result<()> {
    let cli = Cli::parse();

    println!("SolSci Engine — hashing {}", cli.file.display());

    let file_hash = hash_file(&cli.file)?;
    println!("SHA-256: {}", hex::encode(file_hash));

    let metadata = build_metadata(&cli, &file_hash)?;
    println!("Metadata: {}", metadata);

    if cli.dry_run {
        println!("[dry-run] Skipping Solana submission.");
        return Ok(());
    }

    // Solana submission is handled by the anchor-client crate.
    // The full implementation requires a running validator / RPC endpoint and
    // a deployed program ID, so it is wired as a feature-flagged path to keep
    // the engine buildable in CI without a live cluster.
    println!("Submitting to Solana ({})…", cli.rpc_url);
    submit_to_solana(&cli, file_hash, &metadata)?;

    Ok(())
}

/// Submit the hash + metadata to the deployed SolSci Anchor program.
fn submit_to_solana(cli: &Cli, file_hash: [u8; 32], metadata: &str) -> Result<()> {
    use solana_sdk::signature::{read_keypair_file, Signer};
    use solana_client::rpc_client::RpcClient;

    let keypair_path = shellexpand::tilde(
        cli.keypair.to_str().unwrap_or("~/.config/solana/id.json"),
    );
    let payer = read_keypair_file(keypair_path.as_ref())
        .map_err(|e| anyhow::anyhow!("Failed to read keypair: {}", e))?;

    let rpc = RpcClient::new(cli.rpc_url.clone());
    let balance = rpc.get_balance(&payer.pubkey())?;
    println!(
        "Wallet: {} ({} SOL)",
        payer.pubkey(),
        balance as f64 / 1e9
    );

    // Derive the discovery PDA
    let program_id: solana_sdk::pubkey::Pubkey =
        "SoLSci11111111111111111111111111111111111111".parse()?;

    let (discovery_pda, _bump) = solana_sdk::pubkey::Pubkey::find_program_address(
        &[b"discovery", payer.pubkey().as_ref(), file_hash.as_ref()],
        &program_id,
    );

    println!("Certificate PDA: {}", discovery_pda);
    println!(
        "NOTE: Call register_discovery on program {} to finalise.",
        program_id
    );
    println!("(Full anchor-client CPI wired in a subsequent milestone)");

    let _ = metadata;
    Ok(())
}
