use std::{env, error::Error, fmt::Display};

use chrono::{DateTime, Utc};
use common::{Adaptor, Event, Person, Session, Stats, User};
use entity::{account, event, person, session, stats};
use migration::{Migrator, MigratorTrait};
use sea_orm::{
    ActiveModelTrait,
    ActiveValue::{NotSet, Set},
    ColumnTrait, Database, DatabaseConnection, DbBackend, DbErr, EntityTrait, ModelTrait,
    QueryFilter, TransactionError, TransactionTrait, TryIntoModel,
};
use serde_json::json;

mod entity;
mod migration;

pub struct SqlAdaptor {
    db: DatabaseConnection,
}

impl Adaptor for SqlAdaptor {
    type Error = SqlAdaptorError;

    async fn get_stats(&self) -> Result<Stats, Self::Error> {
        let stats_row = get_stats_row(&self.db).await?;
        Ok(Stats {
            event_count: stats_row.event_count.unwrap() as i64,
            person_count: stats_row.person_count.unwrap() as i64,
        })
    }

    async fn increment_stat_event_count(&self) -> Result<i64, Self::Error> {
        let mut current_stats = get_stats_row(&self.db).await?;
        current_stats.event_count = Set(current_stats.event_count.unwrap() + 1);

        Ok(current_stats.save(&self.db).await?.event_count.unwrap() as i64)
    }

    async fn increment_stat_person_count(&self) -> Result<i64, Self::Error> {
        let mut current_stats = get_stats_row(&self.db).await?;
        current_stats.person_count = Set(current_stats.person_count.unwrap() + 1);

        Ok(current_stats.save(&self.db).await?.person_count.unwrap() as i64)
    }

    async fn get_people(&self, event_id: String) -> Result<Option<Vec<Person>>, Self::Error> {
        // TODO: optimize into one query
        let event_row = event::Entity::find_by_id(event_id).one(&self.db).await?;

        Ok(match event_row {
            Some(event) => Some(
                event
                    .find_related(person::Entity)
                    .all(&self.db)
                    .await?
                    .into_iter()
                    .map(|model| model.into())
                    .collect(),
            ),
            None => None,
        })
    }

    async fn upsert_person(
        &self,
        event_id: String,
        person: Person,
    ) -> Result<Option<Person>, Self::Error> {
        let data = person::ActiveModel {
            name: Set(person.name.clone()),
            password_hash: Set(person.password_hash),
            created_at: Set(person.created_at.naive_utc()),
            availability: Set(serde_json::to_value(person.availability).unwrap_or(json!([]))),
            event_id: Set(event_id.clone()),
        };

        // Check if the event exists
        if event::Entity::find_by_id(event_id.clone())
            .one(&self.db)
            .await?
            .is_none()
        {
            return Ok(None);
        }

        Ok(Some(
            match person::Entity::find_by_id((person.name, event_id))
                .one(&self.db)
                .await?
            {
                Some(_) => data.update(&self.db).await?.try_into_model()?.into(),
                None => data.insert(&self.db).await?.try_into_model()?.into(),
            },
        ))
    }

    async fn get_event(&self, id: String) -> Result<Option<Event>, Self::Error> {
        let existing_event = event::Entity::find_by_id(id).one(&self.db).await?;

        // Mark as visited
        if let Some(event) = existing_event.clone() {
            let mut event: event::ActiveModel = event.into();
            event.visited_at = Set(Utc::now().naive_utc());
            event.save(&self.db).await?;
        }

        Ok(existing_event.map(|model| model.into()))
    }

    async fn create_event(&self, event: Event) -> Result<Event, Self::Error> {
        Ok(event::ActiveModel {
            id: Set(event.id),
            name: Set(event.name),
            created_at: Set(event.created_at.naive_utc()),
            visited_at: Set(event.visited_at.naive_utc()),
            times: Set(serde_json::to_value(event.times).unwrap_or(json!([]))),
            timezone: Set(event.timezone),
            owner: Set(event.owner),
        }
        .insert(&self.db)
        .await?
        .try_into_model()?
        .into())
    }

    async fn delete_events(&self, cutoff: DateTime<Utc>) -> Result<Stats, Self::Error> {
        let (event_count, person_count) = self
            .db
            .transaction::<_, (i64, i64), DbErr>(|t| {
                Box::pin(async move {
                    // Get events older than the cutoff date
                    let old_events = event::Entity::find()
                        .filter(event::Column::VisitedAt.lt(cutoff.naive_utc()))
                        .all(t)
                        .await?;

                    // Delete people
                    let mut people_deleted: i64 = 0;
                    // TODO: run concurrently
                    for e in old_events.iter() {
                        let people_delete_result = person::Entity::delete_many()
                            .filter(person::Column::EventId.eq(&e.id))
                            .exec(t)
                            .await?;
                        people_deleted += people_delete_result.rows_affected as i64;
                    }

                    // Delete events
                    let event_delete_result = event::Entity::delete_many()
                        .filter(event::Column::VisitedAt.lt(cutoff.naive_utc()))
                        .exec(t)
                        .await?;

                    Ok((event_delete_result.rows_affected as i64, people_deleted))
                })
            })
            .await?;

        Ok(Stats {
            event_count,
            person_count,
        })
    }

    async fn update_event(&self, event: Event) -> Result<Option<Event>, Self::Error> {
        if event::Entity::find_by_id(event.id.clone())
            .one(&self.db)
            .await?
            .is_none()
        {
            return Ok(None);
        }

        Ok(Some(
            event::ActiveModel {
                id: Set(event.id),
                name: Set(event.name),
                created_at: Set(event.created_at.naive_utc()),
                visited_at: Set(event.visited_at.naive_utc()),
                times: Set(serde_json::to_value(event.times).unwrap_or(json!([]))),
                timezone: Set(event.timezone),
                owner: Set(event.owner),
            }
            .update(&self.db)
            .await?
            .into(),
        ))
    }

    async fn delete_event(&self, id: String) -> Result<bool, Self::Error> {
        Ok(self
            .db
            .transaction::<_, bool, DbErr>(|t| {
                Box::pin(async move {
                    person::Entity::delete_many()
                        .filter(person::Column::EventId.eq(&id))
                        .exec(t)
                        .await?;

                    let result = event::Entity::delete_by_id(id).exec(t).await?;

                    Ok(result.rows_affected > 0)
                })
            })
            .await?)
    }

    async fn get_user(&self, username: String) -> Result<Option<User>, Self::Error> {
        Ok(account::Entity::find_by_id(username)
            .one(&self.db)
            .await?
            .map(|model| model.into()))
    }

    async fn create_user(&self, user: User) -> Result<User, Self::Error> {
        Ok(account::ActiveModel {
            username: Set(user.username),
            display_name: Set(user.display_name),
            password_hash: Set(user.password_hash),
            created_at: Set(user.created_at.naive_utc()),
        }
        .insert(&self.db)
        .await?
        .into())
    }

    async fn get_session(&self, token_hash: String) -> Result<Option<Session>, Self::Error> {
        Ok(session::Entity::find_by_id(token_hash)
            .one(&self.db)
            .await?
            .map(|model| model.into()))
    }

    async fn create_session(&self, session: Session) -> Result<Session, Self::Error> {
        Ok(session::ActiveModel {
            token_hash: Set(session.token_hash),
            username: Set(session.username),
            created_at: Set(session.created_at.naive_utc()),
        }
        .insert(&self.db)
        .await?
        .into())
    }

    async fn delete_session(&self, token_hash: String) -> Result<(), Self::Error> {
        session::Entity::delete_by_id(token_hash)
            .exec(&self.db)
            .await?;
        Ok(())
    }

    async fn delete_sessions(&self, cutoff: DateTime<Utc>) -> Result<i64, Self::Error> {
        Ok(session::Entity::delete_many()
            .filter(session::Column::CreatedAt.lt(cutoff.naive_utc()))
            .exec(&self.db)
            .await?
            .rows_affected as i64)
    }
}

// Get the current stats as an ActiveModel
async fn get_stats_row(db: &DatabaseConnection) -> Result<stats::ActiveModel, DbErr> {
    let current_stats = stats::Entity::find().one(db).await?;

    Ok(match current_stats {
        Some(model) => model.into(),
        None => stats::ActiveModel {
            id: NotSet,
            event_count: Set(0),
            person_count: Set(0),
        },
    })
}

impl SqlAdaptor {
    pub async fn new() -> Self {
        let connection_string =
            env::var("DATABASE_URL").expect("Expected DATABASE_URL environment variable");

        // Connect to the database
        let db = Database::connect(&connection_string)
            .await
            .expect("Failed to connect to SQL database");
        println!(
            "{} Connected to database at {}",
            match db.get_database_backend() {
                DbBackend::MySql => "🐬",
                DbBackend::Postgres => "🐘",
                DbBackend::Sqlite => "🪶",
                _ => "🗄️",
            },
            connection_string
        );

        // Setup tables
        Migrator::up(&db, None)
            .await
            .expect("Failed to set up tables in the database");

        Self { db }
    }
}

impl From<event::Model> for Event {
    fn from(value: event::Model) -> Self {
        Self {
            id: value.id,
            name: value.name,
            created_at: DateTime::<Utc>::from_naive_utc_and_offset(value.created_at, Utc),
            visited_at: DateTime::<Utc>::from_naive_utc_and_offset(value.visited_at, Utc),
            times: serde_json::from_value(value.times).unwrap_or(vec![]),
            timezone: value.timezone,
            owner: value.owner,
        }
    }
}

impl From<person::Model> for Person {
    fn from(value: person::Model) -> Self {
        Self {
            name: value.name,
            password_hash: value.password_hash,
            created_at: DateTime::<Utc>::from_naive_utc_and_offset(value.created_at, Utc),
            availability: serde_json::from_value(value.availability).unwrap_or(vec![]),
        }
    }
}

#[derive(Debug)]
pub enum SqlAdaptorError {
    DbErr(DbErr),
    TransactionError(TransactionError<DbErr>),
}

impl Display for SqlAdaptorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DbErr(e) => write!(f, "Database error: {e}"),
            Self::TransactionError(e) => write!(f, "Transaction error: {e}"),
        }
    }
}

impl Error for SqlAdaptorError {}

impl From<DbErr> for SqlAdaptorError {
    fn from(value: DbErr) -> Self {
        Self::DbErr(value)
    }
}
impl From<TransactionError<DbErr>> for SqlAdaptorError {
    fn from(value: TransactionError<DbErr>) -> Self {
        Self::TransactionError(value)
    }
}

impl From<account::Model> for User {
    fn from(value: account::Model) -> Self {
        Self {
            username: value.username,
            display_name: value.display_name,
            password_hash: value.password_hash,
            created_at: DateTime::<Utc>::from_naive_utc_and_offset(value.created_at, Utc),
        }
    }
}

impl From<session::Model> for Session {
    fn from(value: session::Model) -> Self {
        Self {
            token_hash: value.token_hash,
            username: value.username,
            created_at: DateTime::<Utc>::from_naive_utc_and_offset(value.created_at, Utc),
        }
    }
}
