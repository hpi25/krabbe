# This dockerfile builds the API and runs it on a minimal container with the SQL adaptor

FROM rust:trixie AS builder

WORKDIR /usr/src/app

# Install the nightly toolchain pinned in rust-toolchain.toml
COPY rust-toolchain.toml .
RUN rustup toolchain install

COPY . .
# Will build and cache the binary and dependent crates in release mode
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=target \
    cargo build --release --features sql-adaptor && mv ./target/release/crabfit-api ./api

# Runtime image
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

# Run as "app" user
RUN useradd -ms /bin/bash app

USER app
WORKDIR /app

# Get compiled binary from the builder
COPY --from=builder /usr/src/app/api /app/api

# Run the app
EXPOSE 3000
CMD ["./api"]
