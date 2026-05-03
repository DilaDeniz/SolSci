use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_METADATA_LEN: usize = 512;

#[derive(Serialize, Deserialize, Debug)]
pub struct DiscoveryMetadata {
    pub tool:            String,
    pub version:         String,
    pub analysis_type:   String,
    pub file_size_bytes: u64,
    pub file_name:       String,
}

impl DiscoveryMetadata {
    /// Build metadata from a file path and CLI arguments.
    pub fn from_file(path: &Path, tool_version: &str, analysis_type: &str) -> Result<Self> {
        let file_size = std::fs::metadata(path)
            .with_context(|| format!("Cannot stat {}", path.display()))?
            .len();

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let (tool, version) = tool_version
            .split_once('/')
            .unwrap_or((tool_version, "unknown"));

        Ok(Self {
            tool:            tool.to_string(),
            version:         version.to_string(),
            analysis_type:   analysis_type.to_string(),
            file_size_bytes: file_size,
            file_name,
        })
    }

    /// Serialize to JSON, rejecting payloads that exceed `MAX_METADATA_LEN`.
    pub fn to_json(&self) -> Result<String> {
        let json = serde_json::to_string(self)?;
        anyhow::ensure!(
            json.len() <= MAX_METADATA_LEN,
            "Metadata is {} bytes — exceeds the {}-byte on-chain limit. \
             Shorten --analysis-type or --tool-version.",
            json.len(),
            MAX_METADATA_LEN,
        );
        Ok(json)
    }
}
