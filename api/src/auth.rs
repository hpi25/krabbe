use axum::http::HeaderMap;
use base64::{Engine, engine::general_purpose};
use chrono::{Duration, Utc};
use common::{Adaptor, User};
use rand::RngExt;
use sha2::{Digest, Sha256};

use crate::errors::ApiError;

/// Header that carries the session token of a logged in user
pub const SESSION_HEADER: &str = "x-session-token";

/// How long a session stays valid after logging in
pub const SESSION_LIFETIME: Duration = Duration::days(90);

/// Prefix of person names that belong to registered users, e.g. `@crab`
pub const USER_PREFIX: char = '@';

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Get the user of the session token in the request headers, if any.
/// Fails if a token was sent but is invalid or expired.
pub async fn get_session_user<A: Adaptor>(
    adaptor: &A,
    headers: &HeaderMap,
) -> Result<Option<User>, ApiError<A>> {
    let Some(token) = headers.get(SESSION_HEADER) else {
        return Ok(None);
    };
    let token = token.to_str().map_err(|_| ApiError::NotAuthorized)?;

    let session = adaptor
        .get_session(hash_token(token))
        .await
        .map_err(ApiError::AdaptorError)?
        .filter(|s| s.created_at > Utc::now() - SESSION_LIFETIME)
        .ok_or(ApiError::NotAuthorized)?;

    adaptor
        .get_user(session.username)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotAuthorized)
        .map(Some)
}

/// Like `get_session_user`, but a session is required
pub async fn require_session_user<A: Adaptor>(
    adaptor: &A,
    headers: &HeaderMap,
) -> Result<User, ApiError<A>> {
    get_session_user(adaptor, headers)
        .await?
        .ok_or(ApiError::NotAuthorized)
}

/// Normalize a username, returning None if it contains invalid characters or is the wrong length
pub fn normalize_username(username: &str) -> Option<String> {
    let username = username.trim().to_lowercase();
    let valid_chars = username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    (valid_chars && (3..=32).contains(&username.len())).then_some(username)
}

#[cfg(test)]
mod tests {
    use super::{hash_token, normalize_username};

    #[test]
    fn normalizes_usernames() {
        assert_eq!(normalize_username(" Crab_Fan "), Some("crab_fan".into()));
        assert_eq!(normalize_username("a.b-c"), Some("a.b-c".into()));
        assert_eq!(normalize_username("ab"), None);
        assert_eq!(normalize_username("has space"), None);
        assert_eq!(normalize_username("@crab"), None);
        assert_eq!(normalize_username("krabbé"), None);
        assert_eq!(normalize_username(&"a".repeat(33)), None);
    }

    #[test]
    fn hashes_tokens() {
        assert_eq!(hash_token("token"), hash_token("token"));
        assert_ne!(hash_token("token"), hash_token("other"));
        assert_eq!(hash_token("token").len(), 64);
    }
}
