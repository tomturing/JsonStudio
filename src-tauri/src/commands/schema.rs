use std::time::Duration;

use reqwest::{header::ACCEPT, Url};
use serde_json::Value;

const MAX_SCHEMA_BYTES: usize = 5 * 1024 * 1024;
const SCHEMA_SIZE_ERROR: &str = "Schema response exceeds the 5 MiB limit";

#[tauri::command]
pub async fn fetch_remote_schema(schema_url: String) -> Result<String, String> {
    let url = validate_schema_url(&schema_url)?;
    let client = create_schema_http_client()?;
    let mut response = client
        .get(url)
        .header(ACCEPT, "application/schema+json, application/json")
        .send()
        .await
        .map_err(|error| format!("Failed to fetch schema: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Failed to fetch schema: {error}"))?;

    if response
        .content_length()
        .is_some_and(|length| length > MAX_SCHEMA_BYTES as u64)
    {
        return Err(SCHEMA_SIZE_ERROR.to_string());
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Failed to read schema response: {error}"))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_SCHEMA_BYTES {
            return Err(SCHEMA_SIZE_ERROR.to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    let schema: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Fetched schema is not valid JSON: {error}"))?;
    if !schema.is_object() && !schema.is_boolean() {
        return Err("Fetched schema must be a JSON object or boolean".to_string());
    }

    serde_json::to_string_pretty(&schema)
        .map_err(|error| format!("Failed to format fetched schema: {error}"))
}

fn create_schema_http_client() -> Result<reqwest::Client, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 10 {
                return attempt.stop();
            }
            if attempt.url().scheme() == "https" {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|error| format!("Failed to create schema request: {error}"))
}

fn validate_schema_url(schema_url: &str) -> Result<Url, String> {
    let url = Url::parse(schema_url).map_err(|error| format!("Invalid schema URL: {error}"))?;
    if url.scheme() != "https" {
        return Err("Only HTTPS schema URLs can be fetched automatically".to_string());
    }
    if url.host_str().is_none() {
        return Err("Schema URL must include a host".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Schema URL must not include credentials".to_string());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::{create_schema_http_client, validate_schema_url};

    #[test]
    fn accepts_https_schema_urls() {
        assert!(validate_schema_url("https://biomejs.dev/schemas/2.5.6/schema.json").is_ok());
    }

    #[test]
    fn rejects_non_https_schema_urls() {
        assert!(validate_schema_url("http://example.com/schema.json").is_err());
        assert!(validate_schema_url("file:///tmp/schema.json").is_err());
        assert!(validate_schema_url("https://user:pass@example.com/schema.json").is_err());
    }

    #[test]
    fn creates_a_schema_http_client() {
        assert!(create_schema_http_client().is_ok());
    }
}
