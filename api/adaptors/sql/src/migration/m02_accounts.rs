use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        print!("Setting up accounts...");

        // Accounts table
        manager
            .create_table(
                Table::create()
                    .table(Account::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Account::Username)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Account::DisplayName).string().not_null())
                    .col(ColumnDef::new(Account::PasswordHash).string().not_null())
                    .col(ColumnDef::new(Account::CreatedAt).timestamp().not_null())
                    .to_owned(),
            )
            .await?;

        // Sessions table, with the foreign key declared inline so it also works on SQLite
        manager
            .create_table(
                Table::create()
                    .table(Session::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Session::TokenHash)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Session::Username).string().not_null())
                    .col(ColumnDef::new(Session::CreatedAt).timestamp().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("FK_session_account")
                            .from(Session::Table, Session::Username)
                            .to(Account::Table, Account::Username)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Event owner
        manager
            .alter_table(
                Table::alter()
                    .table(Event::Table)
                    .add_column(ColumnDef::new(Event::Owner).string().null())
                    .to_owned(),
            )
            .await?;

        println!(" done");
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Event::Table)
                    .drop_column(Event::Owner)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(Session::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Account::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Account {
    Table,
    Username,
    DisplayName,
    PasswordHash,
    CreatedAt,
}

#[derive(Iden)]
enum Session {
    Table,
    TokenHash,
    Username,
    CreatedAt,
}

#[derive(Iden)]
enum Event {
    Table,
    Owner,
}
