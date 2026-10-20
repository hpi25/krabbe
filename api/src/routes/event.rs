use axum::{
    Json,
    extract::{self, Path},
    http::StatusCode,
};
use common::{Adaptor, Event};
use rand::{RngExt, seq::IndexedRandom};

use crate::{
    State,
    errors::ApiError,
    payloads::{ApiResult, EventInput, EventResponse},
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
    responses(
        (status = 201, description = "Created", body = EventResponse),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "event",
)]
/// Create a new event
pub async fn create_event<A: Adaptor>(
    extract::State(state): State<A>,
    Json(input): Json<EventInput>,
) -> Result<(StatusCode, Json<EventResponse>), ApiError<A>> {
    let adaptor = &state.lock().await.adaptor;

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

// Generate a random name based on an adjective and a crab species
fn generate_name() -> String {
    let adjectives: Vec<String> =
        serde_json::from_slice(include_bytes!("../res/adjectives.json")).unwrap();
    let crabs: Vec<String> = serde_json::from_slice(include_bytes!("../res/crabs.json")).unwrap();

    format!(
        "{} {} Crab",
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
