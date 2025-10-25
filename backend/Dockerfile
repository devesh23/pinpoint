FROM rust:1.82 as planner
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){println!(\"dummy\");}" > src/main.rs
RUN cargo build --release || true

FROM rust:1.82 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/pinpoint-backend /usr/local/bin/pinpoint-backend
COPY --from=builder /app/mock_positions.json /mock_positions.json
EXPOSE 8080
CMD ["/usr/local/bin/pinpoint-backend"]
