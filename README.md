# Vexis

Vexis adalah sistem absensi berbasis web modern yang dibangun dengan performa tinggi dan keamanan sebagai prioritas utama. Proyek ini menggunakan arsitektur monorepo untuk mengelola frontend React dan backend Rust.

## Tech Stack

### Frontend

- **React 19** & **Vite**
- **TypeScript**
- **Tailwind CSS v4**
- **Shadcn/UI** components

### Backend

- **Rust** & **Axum** 0.7+
- **MongoDB** (Database)
- **JWT** (Authentication)
- **Tokio** (Async Runtime)

## Fitur MVP

- [x] Registrasi & Login (Email + Password)
- [ ] Profil Pengguna dengan Lokasi & Face Embedding
- [ ] Clock In / Clock Out (Geofencing < 200m & Face Validation)
- [ ] Riwayat Absensi Pribadi
- [ ] Dashboard Admin (Rekap Absensi & Manajemen User)
- [ ] Export Data ke CSV

## Struktur Proyek

```text
vexis/
├── apps/
│   ├── vexis-web/   # React Frontend
│   └── vexis-api/   # Rust Backend
├── packages/          # Shared Logic & Components
└── AGENTS.md          # Instruksi khusus untuk AI Agent
```

## Memulai (Getting Started)

### Prasyarat

- [Node.js](https://nodejs.org/) (v18+) & [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (v1.75+)
- [MongoDB](https://www.mongodb.com/) (Lokal atau Atlas)

### Instalasi

1. Clone repository ini.
2. Install dependensi:
   ```bash
   pnpm install
   ```

### Konfigurasi Environment

Buat file `.env` di root atau di dalam masing-masing app folder (lihat contoh di `apps/vexis-api/.env`).

### Menjalankan Development

Jalankan frontend dan backend sekaligus:

```bash
pnpm dev
```

Or run separately:

- **Frontend**: `pnpm dev:web`
- **Backend**: `pnpm dev:api`

## Keamanan & Performa

- Password di-hash menggunakan **bcrypt**.
- Validasi lokasi menggunakan rumus **Haversine** (Geofencing).
- Autentikasi menggunakan **JWT** dengan Refresh Token.
- Target latency request utama **< 300ms**.

## Lisensi

[MIT](LICENSE)
