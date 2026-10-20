use crate::payloads;
use crate::routes;

use utoipa::openapi::security::ApiKey;
use utoipa::openapi::security::ApiKeyValue;
use utoipa::{
    Modify, OpenApi,
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
};

// OpenAPI documentation
#[derive(OpenApi)]
#[openapi(
    info(title = "Crab Fit API"),
    paths(
        routes::stats::get_stats,
        routes::event::create_event,
        routes::event::get_event,
        routes::event::update_event,
        routes::event::delete_event,
        routes::person::get_people,
        routes::person::get_person,
        routes::person::update_person,
        routes::user::register,
        routes::user::login,
        routes::user::logout,
        routes::user::get_me,
        routes::tasks::cleanup,
    ),
    components(schemas(
        payloads::StatsResponse,
        payloads::EventResponse,
        payloads::PersonResponse,
        payloads::EventInput,
        payloads::EventUpdateInput,
        payloads::PersonInput,
        payloads::RegisterInput,
        payloads::LoginInput,
        payloads::UserResponse,
        payloads::SessionResponse,
    )),
    tags(
        (name = "info"),
        (name = "event"),
        (name = "person"),
        (name = "user"),
        (name = "tasks"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

struct SecurityAddon;

// Add password auth spec
impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        openapi.components.as_mut().unwrap().add_security_scheme(
            "password",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("base64")
                    .build(),
            ),
        );
        openapi.components.as_mut().unwrap().add_security_scheme(
            "cron-key",
            SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::new("X-Cron-Key"))),
        );
    }
}
