use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::io::{BufReader, Read};
use std::path::Path;

const BUF_SIZE: usize = 64 * 1024; // 64 KiB read chunks

/// Stream-hash `path` with SHA-256.
///
/// Uses a `BufReader` so arbitrarily large files (multi-GB FASTQ) are never
/// fully loaded into memory.
pub fn hash_file(path: &Path) -> Result<[u8; 32]> {
    let file = std::fs::File::open(path)
        .with_context(|| format!("Cannot open {}", path.display()))?;

    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; BUF_SIZE];

    loop {
        let n = reader.read(&mut buf).with_context(|| {
            format!("Read error on {}", path.display())
        })?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    Ok(hasher.finalize().into())
}
