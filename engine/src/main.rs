use anyhow::{Context, Result};
use clap::Parser;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{read_keypair_file, Signer},
    system_program,
    transaction::Transaction,
};
use std::path::PathBuf;

// ── CLI ────────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(
    name = "solsci-engine",
    about = "Hash a BioFastq-A output file and register the proof on Solana"
)]
struct Cli {
    #[arg(short, long)]
    file: PathBuf,

    #[arg(short, long, default_value = "genomic_analysis")]
    analysis_type: String,

    #[arg(long, default_value = "BioFastq-A/1.0.0")]
    tool_version: String,

    #[arg(long, default_value = "https://api.devnet.solana.com")]
    rpc_url: String,

    #[arg(long, default_value = "~/.config/solana/id.json")]
    keypair: PathBuf,

    /// Deployed SolSci program ID
    #[arg(long)]
    program_id: String,

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

fn hash_file(path: &PathBuf) -> Result<[u8; 32]> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;
    let digest = Sha256::digest(&bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    Ok(out)
}

fn build_metadata(cli: &Cli) -> Result<String> {
    let file_size = std::fs::metadata(&cli.file)
        .context("Could not stat input file")?
        .len();

    let file_name = cli
        .file
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

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
    Ok(json)
}

/// Compute the 8-byte Anchor instruction discriminator: sha256("global:{name}")[0..8]
fn anchor_discriminator(name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("global:{}", name).as_bytes());
    hash[..8].try_into().unwrap()
}

// ── Solana submission ─────────────────────────────────────────────────────────

fn submit_to_solana(cli: &Cli, file_hash: [u8; 32], metadata: &str) -> Result<()> {
    let keypair_path = shellexpand::tilde(
        cli.keypair.to_str().unwrap_or("~/.config/solana/id.json"),
    );
    let payer = read_keypair_file(keypair_path.as_ref())
        .map_err(|e| anyhow::anyhow!("Failed to read keypair: {}", e))?;

    let rpc = RpcClient::new(cli.rpc_url.clone());

    let balance = rpc.get_balance(&payer.pubkey())?;
    println!(
        "Wallet: {} ({:.4} SOL)",
        payer.pubkey(),
        balance as f64 / 1e9
    );
    if balance == 0 {
        anyhow::bail!("Wallet has 0 SOL. Run: solana airdrop 2 --url devnet");
    }

    let program_id: Pubkey = cli.program_id.parse().context("Invalid program ID")?;

    let (discovery_pda, _bump) = Pubkey::find_program_address(
        &[b"discovery", payer.pubkey().as_ref(), file_hash.as_ref()],
        &program_id,
    );
    println!("Certificate PDA: {}", discovery_pda);

    // Encode instruction data: discriminator + file_hash (32 bytes) + metadata (u32 len + bytes)
    let discriminator = anchor_discriminator("register_discovery");
    let metadata_bytes = metadata.as_bytes();
    let mut data = Vec::with_capacity(8 + 32 + 4 + metadata_bytes.len());
    data.extend_from_slice(&discriminator);
    data.extend_from_slice(&file_hash);
    data.extend_from_slice(&(metadata_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(metadata_bytes);

    let instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(discovery_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    };

    let blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer],
        blockhash,
    );

    let sig = rpc
        .send_and_confirm_transaction(&tx)
        .context("Transaction failed — is the program deployed?")?;

    println!("Transaction: {}", sig);
    println!(
        "Explorer: https://explorer.solana.com/tx/{}?cluster=devnet",
        sig
    );
    Ok(())
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() -> Result<()> {
    let cli = Cli::parse();

    println!("SolSci Engine — hashing {}", cli.file.display());

    let file_hash = hash_file(&cli.file)?;
    println!("SHA-256: {}", hex::encode(file_hash));

    let metadata = build_metadata(&cli)?;
    println!("Metadata: {}", metadata);

    if cli.dry_run {
        println!("[dry-run] Skipping Solana submission.");
        return Ok(());
    }

    println!("Submitting to Solana ({})…", cli.rpc_url);
    submit_to_solana(&cli, file_hash, &metadata)?;

    Ok(())
}
