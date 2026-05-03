mod cli;
mod hash;
mod metadata;
mod solana;

use anyhow::{Context, Result};
use clap::Parser;
use solana_client::rpc_client::RpcClient;

fn main() -> Result<()> {
    let cli = cli::Cli::parse();
    match cli.command {
        cli::Command::Register(args) => cmd_register(args),
        cli::Command::Verify(args)   => cmd_verify(args),
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

fn cmd_register(args: cli::RegisterArgs) -> Result<()> {
    println!("SolSci — hashing {}", args.file.display());

    let file_hash = hash::hash_file(&args.file)?;
    println!("  SHA-256  : {}", hex::encode(file_hash));

    let meta = metadata::DiscoveryMetadata::from_file(
        &args.file,
        &args.tool_version,
        &args.analysis_type,
    )?;
    let metadata_json = meta.to_json()?;
    println!("  Metadata : {}", metadata_json);

    if args.dry_run {
        println!("[dry-run] Skipping Solana submission.");
        return Ok(());
    }

    let program_id = args.program_id.parse().context("Invalid --program-id")?;
    let keypair    = solana::load_keypair(&args.keypair)?;
    let rpc        = RpcClient::new(args.rpc_url.clone());

    println!("Submitting to {} ...", args.rpc_url);
    let sig = solana::register(&rpc, &keypair, program_id, file_hash, &metadata_json)?;

    println!("  Signature : {}", sig);
    println!("  Explorer  : https://explorer.solana.com/tx/{}?cluster=devnet", sig);

    Ok(())
}

fn cmd_verify(args: cli::VerifyArgs) -> Result<()> {
    let hash_hex = args.hash.trim().to_lowercase();
    anyhow::ensure!(
        hash_hex.len() == 64 && hash_hex.chars().all(|c| c.is_ascii_hexdigit()),
        "--hash must be a 64-character SHA-256 hex string",
    );

    let file_hash: [u8; 32] = hex::decode(&hash_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("Hash is not 32 bytes"))?;

    let researcher = args.researcher.parse().context("Invalid --researcher pubkey")?;
    let program_id = args.program_id.parse().context("Invalid --program-id")?;
    let rpc        = RpcClient::new(args.rpc_url);

    println!("Querying {} ...", args.researcher);

    match solana::fetch_record(&rpc, program_id, researcher, file_hash)? {
        Some(record) => {
            println!("  Status     : Verified on-chain");
            println!("  Researcher : {}", record.researcher);
            println!("  Hash       : {}", hex::encode(record.file_hash));
            println!("  Timestamp  : {} (Unix {})",
                format_unix(record.timestamp),
                record.timestamp,
            );
            println!("  Metadata   : {}", record.metadata);
        }
        None => {
            println!("  Status     : NOT found on-chain");
        }
    }

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Format a Unix timestamp as an ISO-8601 string without pulling in chrono.
///
/// Accurate for dates between 1970 and ~2100; good enough for CLI display.
fn format_unix(ts: i64) -> String {
    if ts <= 0 {
        return "1970-01-01T00:00:00Z".to_string();
    }

    let secs_per_min  = 60u64;
    let secs_per_hour = 3600u64;
    let secs_per_day  = 86400u64;

    let mut remaining = ts as u64;
    let s = remaining % secs_per_min;  remaining /= secs_per_min;
    let m = remaining % 60;            remaining /= 60;
    let h = remaining % 24;
    let mut days = remaining / 24;

    // Days since epoch → Gregorian calendar
    let (mut year, mut month, mut day) = (1970u32, 1u32, 1u32);
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year { break; }
        days -= days_in_year;
        year += 1;
    }
    loop {
        let dim = days_in_month(month, year);
        if days < dim as u64 { break; }
        days -= dim as u64;
        month += 1;
    }
    day += days as u32;

    let _ = secs_per_day; // suppress unused warning
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, h, m, s)
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(m: u32, y: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11               => 30,
        2 => if is_leap(y) { 29 } else { 28 },
        _ => unreachable!(),
    }
}
