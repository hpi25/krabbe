use std::error::Error;

use chrono::{DateTime, Utc};

/// Data storage adaptor, all methods on an adaptor can return an error if
/// something goes wrong, or potentially None if the data requested was not found.
///
/// Implementations can use `async fn` for each method, as long as the returned futures are `Send`.
pub trait Adaptor: Send + Sync {
    type Error: Error;

    fn get_stats(&self) -> impl Future<Output = Result<Stats, Self::Error>> + Send;
    fn increment_stat_event_count(&self) -> impl Future<Output = Result<i64, Self::Error>> + Send;
    fn increment_stat_person_count(&self) -> impl Future<Output = Result<i64, Self::Error>> + Send;

    fn get_people(
        &self,
        event_id: String,
    ) -> impl Future<Output = Result<Option<Vec<Person>>, Self::Error>> + Send;
    fn upsert_person(
        &self,
        event_id: String,
        person: Person,
    ) -> impl Future<Output = Result<Option<Person>, Self::Error>> + Send;

    /// Get an event and update visited date to current time
    fn get_event(
        &self,
        id: String,
    ) -> impl Future<Output = Result<Option<Event>, Self::Error>> + Send;
    fn create_event(&self, event: Event)
    -> impl Future<Output = Result<Event, Self::Error>> + Send;
    /// Update an existing event's details, returns None if the event doesn't exist
    fn update_event(
        &self,
        event: Event,
    ) -> impl Future<Output = Result<Option<Event>, Self::Error>> + Send;
    /// Delete an event and its associated people, returns false if the event doesn't exist
    fn delete_event(&self, id: String) -> impl Future<Output = Result<bool, Self::Error>> + Send;

    /// Delete events older than a cutoff date, as well as any associated people
    /// Returns the amount of events and people deleted
    fn delete_events(
        &self,
        cutoff: DateTime<Utc>,
    ) -> impl Future<Output = Result<Stats, Self::Error>> + Send;

    fn get_user(
        &self,
        username: String,
    ) -> impl Future<Output = Result<Option<User>, Self::Error>> + Send;
    fn create_user(&self, user: User) -> impl Future<Output = Result<User, Self::Error>> + Send;

    fn get_session(
        &self,
        token_hash: String,
    ) -> impl Future<Output = Result<Option<Session>, Self::Error>> + Send;
    fn create_session(
        &self,
        session: Session,
    ) -> impl Future<Output = Result<Session, Self::Error>> + Send;
    fn delete_session(&self, token_hash: String)
    -> impl Future<Output = Result<(), Self::Error>> + Send;
    /// Delete sessions created before a cutoff date, returns the amount deleted
    fn delete_sessions(
        &self,
        cutoff: DateTime<Utc>,
    ) -> impl Future<Output = Result<i64, Self::Error>> + Send;
}

#[derive(Clone)]
pub struct Stats {
    pub event_count: i64,
    pub person_count: i64,
}

#[derive(Clone)]
pub struct Event {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub visited_at: DateTime<Utc>,
    pub times: Vec<String>,
    pub timezone: String,
    /// Username of the registered user that created the event
    pub owner: Option<String>,
}

#[derive(Clone)]
pub struct Person {
    /// Unique within an event. People belonging to a registered user
    /// are named after their username with an `@` prefix, e.g. `@crab`
    pub name: String,
    pub password_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub availability: Vec<String>,
}

/// A registered user of this instance
#[derive(Clone)]
pub struct User {
    /// Unique and lowercase
    pub username: String,
    pub display_name: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct Session {
    /// SHA-256 hash of the session token, so tokens can't be recovered from storage
    pub token_hash: String,
    pub username: String,
    pub created_at: DateTime<Utc>,
}
