# AbsenGo Web (Frontend)

Aplikasi frontend AbsenGo yang dibangun menggunakan React 19 dan Vite.

## Fitur

- UI Modern dengan Shadcn/UI & Tailwind CSS v4
- Autentikasi JWT (State Management via Context/Hooks)
- Validasi Geofencing (Browser Geolocation API)
- Pengolahan Face Embedding (Client-side preprocessing)

## Development

Pastikan Anda sudah menginstal Node.js dan pnpm.

### Menjalankan Development Server

```bash
pnpm dev
```

### Build untuk Produksi

```bash
pnpm build
```

### Linting

```bash
pnpm lint
```

## Struktur Folder

- `src/components/ui/`: Komponen UI dasar dari shadcn.
- `src/components/`: Komponen bisnis/layout aplikasi.
- `src/hooks/`: Custom React hooks.
- `src/lib/`: Utilitas dan konfigurasi library (axios, utils, dll).
- `src/assets/`: File statis seperti gambar dan logo.
