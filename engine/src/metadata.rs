use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_METADATA_LEN: usize = 512;

#[derive(Serialize, Deserialize, Debug)]
pub struct DiscoveryMetadata {
    pub analysis_type:   String,
    #[serde(skip_serializing_if = "str::is_empty")]
    pub tool:            String,
    #[serde(skip_serializing_if = "str::is_empty")]
    pub version:         String,
    #[serde(skip_serializing_if = "str::is_empty")]
    pub description:     String,
    pub file_name:       String,
    pub file_size_bytes: u64,
}

impl DiscoveryMetadata {
    /// Build metadata from a file path and CLI arguments.
    pub fn from_file(
        path:          &Path,
        analysis_type: &str,
        tool:          &str,
        version:       &str,
        description:   &str,
    ) -> Result<Self> {
        let file_size = std::fs::metadata(path)
            .with_context(|| format!("Cannot stat {}", path.display()))?
            .len();

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        Ok(Self {
            analysis_type:   analysis_type.to_string(),
            tool:            tool.to_string(),
            version:         version.to_string(),
            description:     description.to_string(),
            file_name,
            file_size_bytes: file_size,
        })
    }

    /// Serialize to JSON, rejecting payloads that exceed `MAX_METADATA_LEN`.
    pub fn to_json(&self) -> Result<String> {
        let json = serde_json::to_string(self)?;
        anyhow::ensure!(
            json.len() <= MAX_METADATA_LEN,
            "Metadata is {} bytes — exceeds the {}-byte on-chain limit. \
             Shorten --description or use a shorter file name.",
            json.len(),
            MAX_METADATA_LEN,
        );
        Ok(json)
    }
}
