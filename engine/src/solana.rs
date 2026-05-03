use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signer},
    system_program,
    transaction::Transaction,
};
use std::path::Path;

// ── Key loading ───────────────────────────────────────────────────────────────

pub fn load_keypair(path: &Path) -> Result<Keypair> {
    let expanded = shellexpand::tilde(
        path.to_str().unwrap_or("~/.config/solana/id.json"),
    );
    read_keypair_file(expanded.as_ref())
        .map_err(|e| anyhow::anyhow!("Cannot read keypair from {}: {}", expanded, e))
}

// ── PDA ───────────────────────────────────────────────────────────────────────

pub fn discovery_pda(
    researcher: &Pubkey,
    file_hash:  &[u8; 32],
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"discovery", researcher.as_ref(), file_hash.as_ref()],
        program_id,
    )
}

// ── Instructions ──────────────────────────────────────────────────────────────

/// Compute the 8-byte Anchor instruction discriminator: `sha256("global:{name}")[..8]`.
pub fn discriminator(name: &str) -> [u8; 8] {
    Sha256::digest(format!("global:{name}").as_bytes())[..8]
        .try_into()
        .expect("sha256 output is always >= 8 bytes")
}

/// Borsh-encode `register_discovery` instruction data.
///
/// Layout: discriminator(8) | file_hash(32) | metadata_len(4 LE) | metadata(N)
fn encode_register(file_hash: [u8; 32], metadata: &str) -> Vec<u8> {
    let meta = metadata.as_bytes();
    let mut data = Vec::with_capacity(8 + 32 + 4 + meta.len());
    data.extend_from_slice(&discriminator("register_discovery"));
    data.extend_from_slice(&file_hash);
    data.extend_from_slice(&(meta.len() as u32).to_le_bytes());
    data.extend_from_slice(meta);
    data
}

// ── Actions ───────────────────────────────────────────────────────────────────

/// Submit `register_discovery` to the program and return the transaction signature.
pub fn register(
    rpc:        &RpcClient,
    payer:      &Keypair,
    program_id: Pubkey,
    file_hash:  [u8; 32],
    metadata:   &str,
) -> Result<String> {
    let balance = rpc
        .get_balance(&payer.pubkey())
        .context("Failed to fetch wallet balance")?;

    anyhow::ensure!(
        balance > 0,
        "Wallet {} has 0 SOL — run: solana airdrop 2 --url devnet",
        payer.pubkey(),
    );

    let (pda, _bump) = discovery_pda(&payer.pubkey(), &file_hash, &program_id);

    println!("  Wallet      : {} ({:.4} SOL)", payer.pubkey(), balance as f64 / 1e9);
    println!("  Certificate : {}", pda);

    let ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode_register(file_hash, metadata),
    };

    let blockhash = rpc.get_latest_blockhash().context("Failed to fetch blockhash")?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[payer],
        blockhash,
    );

    rpc.send_and_confirm_transaction(&tx)
        .context("Transaction failed — verify the program is deployed and --program-id is correct")
        .map(|sig| sig.to_string())
}

/// Fetch and deserialize a `DiscoveryRecord` account. Returns `None` if not found.
pub fn fetch_record(
    rpc:        &RpcClient,
    program_id: Pubkey,
    researcher: Pubkey,
    file_hash:  [u8; 32],
) -> Result<Option<DiscoveryRecord>> {
    let (pda, _) = discovery_pda(&researcher, &file_hash, &program_id);

    match rpc.get_account(&pda) {
        Ok(account) => {
            // Skip the 8-byte Anchor discriminator prefix.
            DiscoveryRecord::deserialize(&account.data[8..]).map(Some)
        }
        Err(_) => Ok(None),
    }
}

// ── Account deserialization ───────────────────────────────────────────────────

pub struct DiscoveryRecord {
    pub researcher: Pubkey,
    pub file_hash:  [u8; 32],
    pub timestamp:  i64,
    pub metadata:   String,
}

impl DiscoveryRecord {
    /// Deserialize from raw Borsh bytes (discriminator already stripped).
    ///
    /// Layout: pubkey(32) | file_hash(32) | timestamp(8) | str_len(4 LE) | metadata(N) | bump(1)
    fn deserialize(data: &[u8]) -> Result<Self> {
        let mut cur = data;

        let researcher = read_pubkey(&mut cur)?;
        let file_hash  = read_fixed::<32>(&mut cur)?;
        let timestamp  = read_i64(&mut cur)?;
        let metadata   = read_string(&mut cur)?;

        Ok(Self { researcher, file_hash, timestamp, metadata })
    }
}

// ── Deserialization helpers ───────────────────────────────────────────────────

fn read_pubkey(cur: &mut &[u8]) -> Result<Pubkey> {
    let bytes = read_fixed::<32>(cur)?;
    Ok(Pubkey::from(bytes))
}

fn read_fixed<const N: usize>(cur: &mut &[u8]) -> Result<[u8; N]> {
    anyhow::ensure!(cur.len() >= N, "Account data truncated");
    let out = cur[..N].try_into().unwrap();
    *cur = &cur[N..];
    Ok(out)
}

fn read_i64(cur: &mut &[u8]) -> Result<i64> {
    let bytes = read_fixed::<8>(cur)?;
    Ok(i64::from_le_bytes(bytes))
}

fn read_string(cur: &mut &[u8]) -> Result<String> {
    let len = u32::from_le_bytes(read_fixed::<4>(cur)?) as usize;
    anyhow::ensure!(cur.len() >= len, "Account data truncated in string field");
    let s = std::str::from_utf8(&cur[..len]).context("Metadata is not valid UTF-8")?;
    *cur = &cur[len..];
    Ok(s.to_string())
}
