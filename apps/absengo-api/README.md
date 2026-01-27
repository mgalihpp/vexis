# AbsenGo API (Backend)

Backend service untuk AbsenGo menggunakan Rust dan framework Axum.

## Fitur

- REST API dengan Axum 0.7
- Integrasi MongoDB menggunakan `mongodb` driver
- Autentikasi JWT
- Password hashing dengan bcrypt
- Validasi lokasi (Geofencing)

## Development

Pastikan Anda sudah menginstal Rust.

### Menjalankan Server

```bash
cargo run
```

### Testing

```bash
cargo test
```

### Linting & Formatting

```bash
cargo fmt
cargo clippy
```

## Struktur Kode

- `src/handlers/`: Logika pemrosesan request.
- `src/models/`: Definisi struct dan skema database.
- `src/routes/`: Definisi endpoint API.
- `src/config/`: Konfigurasi database dan env.
- `src/utils/`: Fungsi pembantu (helper functions).
