use axum::Json;
use common::{Event, Stats, User};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::errors::ApiError;

pub type ApiResult<T, A> = Result<Json<T>, ApiError<A>>;

#[derive(Deserialize, ToSchema)]
pub struct EventInput {
    pub name: Option<String>,
    pub times: Vec<String>,
    pub timezone: String,
}

#[derive(Deserialize, ToSchema)]
pub struct EventUpdateInput {
    pub name: Option<String>,
    pub times: Option<Vec<String>>,
    pub timezone: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct EventResponse {
    pub id: String,
    pub name: String,
    pub times: Vec<String>,
    pub timezone: String,
    pub created_at: i64,
    /// Username of the registered user that created the event
    pub owner: Option<String>,
}

impl From<Event> for EventResponse {
    fn from(value: Event) -> Self {
        Self {
            id: value.id,
            name: value.name,
            times: value.times,
            timezone: value.timezone,
            created_at: value.created_at.timestamp(),
            owner: value.owner,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct StatsResponse {
    pub event_count: i64,
    pub person_count: i64,
    pub version: String,
}

impl From<Stats> for StatsResponse {
    fn from(value: Stats) -> Self {
        Self {
            event_count: value.event_count,
            person_count: value.person_count,
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct PersonResponse {
    /// Unique within the event, `@username` for registered users
    pub name: String,
    /// Name to show, the user's display name for registered users
    pub display_name: String,
    /// Username of the registered user, if any
    pub username: Option<String>,
    pub availability: Vec<String>,
    pub created_at: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct PersonInput {
    pub availability: Vec<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct RegisterInput {
    pub username: String,
    pub display_name: String,
    pub password: String,
}

#[derive(Deserialize, ToSchema)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct UserResponse {
    pub username: String,
    pub display_name: String,
}

impl From<User> for UserResponse {
    fn from(value: User) -> Self {
        Self {
            username: value.username,
            display_name: value.display_name,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct SessionResponse {
    /// Send in the `X-Session-Token` header to authenticate
    pub token: String,
    pub user: UserResponse,
}
