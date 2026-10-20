use axum::{
    Json,
    extract::{self, Path},
    http::{HeaderMap, StatusCode},
};
use common::{Adaptor, Event};
use rand::{RngExt, seq::IndexedRandom};

use crate::{
    State,
    errors::ApiError,
    auth::{get_session_user, require_session_user},
    payloads::{ApiResult, EventInput, EventResponse, EventUpdateInput},
    punycode,
};

#[utoipa::path(
    get,
    path = "/event/{event_id}",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    responses(
        (status = 200, description = "Ok", body = EventResponse),
        (status = 404, description = "Not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Get details about an event
pub async fn get_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
) -> ApiResult<EventResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    let event = adaptor
        .get_event(event_id)
        .await
        .map_err(ApiError::AdaptorError)?;

    match event {
        Some(event) => Ok(Json(event.into())),
        None => Err(ApiError::NotFound),
    }
}

#[utoipa::path(
    post,
    path = "/event",
    request_body(content = EventInput, description = "New event details"),
    security((), ("session" = [])),
    responses(
        (status = 201, description = "Created", body = EventResponse),
        (status = 401, description = "Invalid or expired session"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Create a new event, owned by the logged in user if there is a session
pub async fn create_event<A: Adaptor>(
    extract::State(state): State<A>,
    headers: HeaderMap,
    Json(input): Json<EventInput>,
) -> Result<(StatusCode, Json<EventResponse>), ApiError<A>> {
    let adaptor = &state.lock().await.adaptor;

    let owner = get_session_user(adaptor, &headers).await?.map(|u| u.username);

    // Get the current timestamp
    let now = chrono::offset::Utc::now();

    // Generate a name if none provided
    let name = match input.name {
        Some(x) if !x.is_empty() => x.trim().to_string(),
        _ => generate_name(),
    };

    // Generate an ID
    let mut id = generate_id(&name);

    // Check the ID doesn't already exist
    while (adaptor
        .get_event(id.clone())
        .await
        .map_err(ApiError::AdaptorError)?)
    .is_some()
    {
        id = generate_id(&name);
    }

    let event = adaptor
        .create_event(Event {
            id,
            name,
            created_at: now,
            visited_at: now,
            times: input.times,
            timezone: input.timezone,
            owner,
        })
        .await
        .map_err(ApiError::AdaptorError)?;

    // Update stats
    adaptor
        .increment_stat_event_count()
        .await
        .map_err(ApiError::AdaptorError)?;

    Ok((StatusCode::CREATED, Json(event.into())))
}

#[utoipa::path(
    patch,
    path = "/event/{event_id}",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    security(("session" = [])),
    request_body(content = EventUpdateInput, description = "Event details to change"),
    responses(
        (status = 200, description = "Ok", body = EventResponse),
        (status = 401, description = "Missing, invalid or expired session"),
        (status = 403, description = "Not the owner of the event"),
        (status = 404, description = "Not found"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Change the details of an event owned by the logged in user
pub async fn update_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<EventUpdateInput>,
) -> ApiResult<EventResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    let mut event = get_owned_event(adaptor, event_id, &headers).await?;

    if let Some(name) = input.name.map(|n| n.trim().to_string()) {
        if name.is_empty() {
            return Err(ApiError::InvalidInput("Name can't be empty"));
        }
        event.name = name;
    }
    if let Some(times) = input.times {
        if times.is_empty() {
            return Err(ApiError::InvalidInput("Times can't be empty"));
        }
        event.times = times;
    }
    if let Some(timezone) = input.timezone {
        event.timezone = timezone;
    }

    let event = adaptor
        .update_event(event)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(event.into()))
}

#[utoipa::path(
    delete,
    path = "/event/{event_id}",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    security(("session" = [])),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing, invalid or expired session"),
        (status = 403, description = "Not the owner of the event"),
        (status = 404, description = "Not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Delete an event owned by the logged in user, along with everyone's availabilities
pub async fn delete_event<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError<A>> {
    let adaptor = &state.lock().await.adaptor;

    let event = get_owned_event(adaptor, event_id, &headers).await?;

    adaptor
        .delete_event(event.id)
        .await
        .map_err(ApiError::AdaptorError)?;

    Ok(StatusCode::NO_CONTENT)
}

// Get an event, making sure the logged in user owns it
async fn get_owned_event<A: Adaptor>(
    adaptor: &A,
    event_id: String,
    headers: &HeaderMap,
) -> Result<Event, ApiError<A>> {
    let user = require_session_user(adaptor, headers).await?;

    let event = adaptor
        .get_event(event_id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    if event.owner.as_deref() != Some(user.username.as_str()) {
        return Err(ApiError::Forbidden);
    }

    Ok(event)
}

// Generate a random name based on an adjective and a crab species
fn generate_name() -> String {
    let adjectives: Vec<String> =
        serde_json::from_slice(include_bytes!("../res/adjectives.json")).unwrap();
    let crabs: Vec<String> = serde_json::from_slice(include_bytes!("../res/crabs.json")).unwrap();

    format!(
        "{} {} Star",
        adjectives.choose(&mut rand::rng()).unwrap(),
        crabs.choose(&mut rand::rng()).unwrap()
    )
}

// Generate a slug for the crab fit
fn generate_id(name: &str) -> String {
    let mut id = encode_name(name.to_string());
    if id.replace('-', "").is_empty() {
        id = encode_name(generate_name());
    }
    let number = rand::rng().random_range(100000..=999999);
    format!("{}-{}", id, number)
}

// Use punycode to encode the name
fn encode_name(name: String) -> String {
    let pc = punycode::encode(&name.trim().to_lowercase())
        .unwrap_or_default()
        .trim()
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != ' ', "");

    // Collapse each run of spaces into a single hyphen
    let mut slug = String::with_capacity(pc.len());
    for c in pc.chars() {
        if c != ' ' {
            slug.push(c);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    slug
}

#[cfg(test)]
mod tests {
    use super::encode_name;

    #[test]
    fn encodes_names_into_slugs() {
        // Outputs of the previous punycode + regex implementation
        let cases = [
            ("Hello World", "hello-world"),
            ("  Team   Meeting  ", "team-meeting"),
            ("Café Crème", "caf-crme60ag"),
            ("Über straße", "ber-straen1a42a"),
            ("日本語のイベント", "u9jxfmevcwg6105ao4bc84j"),
            ("🦀 Crab Party 🦀", "crab-party-k758kma"),
            ("", ""),
            ("   ", ""),
            ("ñ", "ida"),
            ("Ünïcödé Ståř Fït", "ncd-st-ftb3a4b7dj3g3d91f"),
            ("Ｆｕｌｌｗｉｄｔｈ", "pi7cdhcoa2ddu"),
            ("a-b_c.d", "abcd"),
            ("Мероприятие", "e1aaiarnhgcv6l"),
            ("x\ty\nz", "xyz"),
            ("MiXeD CaSe 123", "mixed-case-123"),
            ("ελληνικά", "hxargifdar"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                encode_name(input.to_string()),
                expected,
                "encoding {input:?}"
            );
        }
    }
}
