use axum::{
    Json, extract,
    http::{HeaderMap, StatusCode},
};
use common::{Adaptor, Session, User};

use crate::{
    State,
    auth::{
        SESSION_HEADER, generate_token, get_session_user, hash_token, normalize_username,
    },
    errors::ApiError,
    payloads::{ApiResult, LoginInput, RegisterInput, SessionResponse, UserResponse},
};

#[utoipa::path(
    post,
    path = "/user/register",
    request_body(content = RegisterInput, description = "New user details"),
    responses(
        (status = 201, description = "Created", body = SessionResponse),
        (status = 409, description = "Username is taken"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "user",
)]
/// Register a new user on this instance and log in
pub async fn register<A: Adaptor>(
    extract::State(state): State<A>,
    Json(input): Json<RegisterInput>,
) -> Result<(StatusCode, Json<SessionResponse>), ApiError<A>> {
    let adaptor = &state.lock().await.adaptor;

    let username =
        normalize_username(&input.username).ok_or(ApiError::InvalidInput("Invalid username"))?;
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() || display_name.chars().count() > 64 {
        return Err(ApiError::InvalidInput("Invalid display name"));
    }
    // bcrypt only uses the first 72 bytes
    if input.password.chars().count() < 8 || input.password.len() > 72 {
        return Err(ApiError::InvalidInput("Invalid password"));
    }

    if adaptor
        .get_user(username.clone())
        .await
        .map_err(ApiError::AdaptorError)?
        .is_some()
    {
        return Err(ApiError::Conflict);
    }

    let user = adaptor
        .create_user(User {
            username,
            display_name,
            password_hash: bcrypt::hash(input.password, 10).unwrap_or_default(),
            created_at: chrono::offset::Utc::now(),
        })
        .await
        .map_err(ApiError::AdaptorError)?;

    Ok((StatusCode::CREATED, Json(create_session(adaptor, user).await?)))
}

#[utoipa::path(
    post,
    path = "/user/login",
    request_body(content = LoginInput, description = "User credentials"),
    responses(
        (status = 200, description = "Ok", body = SessionResponse),
        (status = 401, description = "Incorrect username or password"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "user",
)]
/// Log in as a registered user
pub async fn login<A: Adaptor>(
    extract::State(state): State<A>,
    Json(input): Json<LoginInput>,
) -> ApiResult<SessionResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    let user = match normalize_username(&input.username) {
        Some(username) => adaptor
            .get_user(username)
            .await
            .map_err(ApiError::AdaptorError)?,
        None => None,
    }
    .filter(|u| bcrypt::verify(&input.password, &u.password_hash).unwrap_or(false))
    .ok_or(ApiError::NotAuthorized)?;

    Ok(Json(create_session(adaptor, user).await?))
}

#[utoipa::path(
    post,
    path = "/user/logout",
    security(("session" = [])),
    responses(
        (status = 204, description = "Logged out"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "user",
)]
/// End the current session
pub async fn logout<A: Adaptor>(
    extract::State(state): State<A>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError<A>> {
    let adaptor = &state.lock().await.adaptor;

    if let Some(token) = headers.get(SESSION_HEADER).and_then(|t| t.to_str().ok()) {
        adaptor
            .delete_session(hash_token(token))
            .await
            .map_err(ApiError::AdaptorError)?;
    }

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/user/me",
    security(("session" = [])),
    responses(
        (status = 200, description = "Ok", body = UserResponse),
        (status = 401, description = "Missing, invalid or expired session"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "user",
)]
/// Get the currently logged in user
pub async fn get_me<A: Adaptor>(
    extract::State(state): State<A>,
    headers: HeaderMap,
) -> ApiResult<UserResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    // Treat a missing session the same as an invalid one
    let user = get_session_user(adaptor, &headers).await?;
    Ok(Json(user.ok_or(ApiError::NotAuthorized)?.into()))
}

async fn create_session<A: Adaptor>(
    adaptor: &A,
    user: User,
) -> Result<SessionResponse, ApiError<A>> {
    let token = generate_token();

    adaptor
        .create_session(Session {
            token_hash: hash_token(&token),
            username: user.username.clone(),
            created_at: chrono::offset::Utc::now(),
        })
        .await
        .map_err(ApiError::AdaptorError)?;

    Ok(SessionResponse {
        token,
        user: user.into(),
    })
}

