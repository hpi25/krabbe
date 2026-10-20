use axum::{
    Json,
    extract::{self, Path},
    http::HeaderMap,
};
use axum_extra::{
    TypedHeader,
    headers::{Authorization, authorization::Bearer},
};
use base64::{Engine, engine::general_purpose};
use common::{Adaptor, Person};

use crate::{
    State,
    auth::{USER_PREFIX, get_session_user},
    errors::ApiError,
    payloads::{ApiResult, PersonInput, PersonResponse},
};

#[utoipa::path(
    get,
    path = "/event/{event_id}/people",
    params(
        ("event_id", description = "The ID of the event"),
    ),
    responses(
        (status = 200, description = "Ok", body = [PersonResponse]),
        (status = 404, description = "Event not found"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Get availabilities for an event
pub async fn get_people<A: Adaptor>(
    extract::State(state): State<A>,
    Path(event_id): Path<String>,
) -> ApiResult<Vec<PersonResponse>, A> {
    let adaptor = &state.lock().await.adaptor;

    let people = adaptor
        .get_people(event_id)
        .await
        .map_err(ApiError::AdaptorError)?
        .ok_or(ApiError::NotFound)?;

    let mut responses = Vec::with_capacity(people.len());
    for person in people.into_iter().filter(|p| !p.availability.is_empty()) {
        responses.push(person_response(adaptor, person).await?);
    }

    Ok(Json(responses))
}

#[utoipa::path(
    get,
    path = "/event/{event_id}/people/{person_name}",
    params(
        ("event_id", description = "The ID of the event"),
        ("person_name", description = "The name of the person, or `@username` for the logged in user"),
    ),
    security((), ("password" = []), ("session" = [])),
    responses(
        (status = 200, description = "Ok", body = PersonResponse),
        (status = 401, description = "Incorrect password, or session doesn't match the username"),
        (status = 404, description = "Event not found"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Login or create a person for an event
pub async fn get_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    headers: HeaderMap,
    bearer: Option<TypedHeader<Authorization<Bearer>>>,
) -> ApiResult<PersonResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    // Get inputted password
    let password = parse_password(bearer);

    let existing_people = adaptor
        .get_people(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?;

    // Event not found
    if existing_people.is_none() {
        return Err(ApiError::NotFound);
    }

    let is_user = verify_user(adaptor, &person_name, &headers).await?;

    // Check if the user already exists
    let existing_person = existing_people
        .unwrap()
        .into_iter()
        .find(|p| p.name.to_lowercase() == person_name.to_lowercase());

    let person = match existing_person {
        // Login
        Some(p) => {
            // Verify password (if set)
            if is_user || verify_password(&p, password) {
                p
            } else {
                return Err(ApiError::NotAuthorized);
            }
        }
        // Signup
        None => {
            // Update stats
            adaptor
                .increment_stat_person_count()
                .await
                .map_err(ApiError::AdaptorError)?;

            adaptor
                .upsert_person(
                    event_id,
                    Person {
                        // Registered users are always stored lowercase, matching their username
                        name: if is_user {
                            person_name.to_lowercase()
                        } else {
                            person_name
                        },
                        // Registered users authenticate with their session instead
                        password_hash: password
                            .filter(|_| !is_user)
                            .map(|raw| bcrypt::hash(raw, 10).unwrap_or(String::from(""))),
                        created_at: chrono::offset::Utc::now(),
                        availability: vec![],
                    },
                )
                .await
                .map_err(ApiError::AdaptorError)?
                .unwrap()
        }
    };

    Ok(Json(person_response(adaptor, person).await?))
}

#[utoipa::path(
    patch,
    path = "/event/{event_id}/people/{person_name}",
    params(
        ("event_id", description = "The ID of the event"),
        ("person_name", description = "The name of the person, or `@username` for the logged in user"),
    ),
    security((), ("password" = []), ("session" = [])),
    request_body(content = PersonInput, description = "Person details"),
    responses(
        (status = 200, description = "Ok", body = PersonResponse),
        (status = 401, description = "Incorrect password, or session doesn't match the username"),
        (status = 404, description = "Event or person not found"),
        (status = 415, description = "Unsupported input format"),
        (status = 422, description = "Invalid input provided"),
        (status = 429, description = "Too many requests"),
    ),
    tag = "person",
)]
/// Update a person's availabilities
pub async fn update_person<A: Adaptor>(
    extract::State(state): State<A>,
    Path((event_id, person_name)): Path<(String, String)>,
    headers: HeaderMap,
    bearer: Option<TypedHeader<Authorization<Bearer>>>,
    Json(input): Json<PersonInput>,
) -> ApiResult<PersonResponse, A> {
    let adaptor = &state.lock().await.adaptor;

    let existing_people = adaptor
        .get_people(event_id.clone())
        .await
        .map_err(ApiError::AdaptorError)?;

    // Event not found
    if existing_people.is_none() {
        return Err(ApiError::NotFound);
    }

    let is_user = verify_user(adaptor, &person_name, &headers).await?;

    // Check if the user exists
    let existing_person = existing_people
        .unwrap()
        .into_iter()
        .find(|p| p.name.to_lowercase() == person_name.to_lowercase())
        .ok_or(ApiError::NotFound)?;

    // Verify password (if set)
    if !is_user && !verify_password(&existing_person, parse_password(bearer)) {
        return Err(ApiError::NotAuthorized);
    }

    let person = adaptor
        .upsert_person(
            event_id,
            Person {
                name: existing_person.name,
                password_hash: existing_person.password_hash,
                created_at: existing_person.created_at,
                availability: input.availability,
            },
        )
        .await
        .map_err(ApiError::AdaptorError)?
        .unwrap();

    Ok(Json(person_response(adaptor, person).await?))
}

pub fn parse_password(bearer: Option<TypedHeader<Authorization<Bearer>>>) -> Option<String> {
    bearer.map(|TypedHeader(Authorization(b))| {
        String::from_utf8(
            general_purpose::STANDARD
                .decode(b.token().trim())
                .unwrap_or(vec![]),
        )
        .unwrap_or("".to_owned())
    })
}

pub fn verify_password(person: &Person, raw: Option<String>) -> bool {
    match &person.password_hash {
        Some(hash) => bcrypt::verify(raw.unwrap_or("".to_owned()), hash).unwrap_or(false),
        // Specifically allow a user who doesn't have a password
        // set to log in with or without any password input
        None => true,
    }
}

/// Names starting with `@` are reserved for registered users, so make sure the session
/// belongs to that user. Returns whether the name belongs to the logged in user.
async fn verify_user<A: Adaptor>(
    adaptor: &A,
    person_name: &str,
    headers: &HeaderMap,
) -> Result<bool, ApiError<A>> {
    let Some(username) = person_name.strip_prefix(USER_PREFIX) else {
        return Ok(false);
    };

    match get_session_user(adaptor, headers).await? {
        Some(user) if user.username == username.to_lowercase() => Ok(true),
        _ => Err(ApiError::NotAuthorized),
    }
}

async fn person_response<A: Adaptor>(
    adaptor: &A,
    person: Person,
) -> Result<PersonResponse, ApiError<A>> {
    let username = person
        .name
        .strip_prefix(USER_PREFIX)
        .map(|u| u.to_string());

    let display_name = match &username {
        Some(username) => adaptor
            .get_user(username.clone())
            .await
            .map_err(ApiError::AdaptorError)?
            .map(|u| u.display_name)
            .unwrap_or(username.clone()),
        None => person.name.clone(),
    };

    Ok(PersonResponse {
        name: person.name,
        display_name,
        username,
        availability: person.availability,
        created_at: person.created_at.timestamp(),
    })
}
