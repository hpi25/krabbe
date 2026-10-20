#[cfg(feature = "sql-adaptor")]
pub async fn create_adaptor() -> sql_adaptor::SqlAdaptor {
    sql_adaptor::SqlAdaptor::new().await
}

#[cfg(not(feature = "sql-adaptor"))]
pub async fn create_adaptor() -> memory_adaptor::MemoryAdaptor {
    memory_adaptor::MemoryAdaptor::new().await
}
