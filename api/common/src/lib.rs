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

    /// Delete events older than a cutoff date, as well as any associated people
    /// Returns the amount of events and people deleted
    fn delete_events(
        &self,
        cutoff: DateTime<Utc>,
    ) -> impl Future<Output = Result<Stats, Self::Error>> + Send;
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
}

#[derive(Clone)]
pub struct Person {
    pub name: String,
    pub password_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub availability: Vec<String>,
}
