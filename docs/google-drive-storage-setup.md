# Setup Google Drive Storage Provider

Panduan ini menyiapkan Google Drive sebagai storage utama StagePilot V1. Host tetap memakai tombol Upload Material biasa; detail Google Drive hanya untuk operator aplikasi.

## Status Presentation Support

Saat ini StagePilot mendukung media berikut untuk upload file:
- **PDF**: SUPPORTED untuk upload Google Drive, registry D1, asset proxy StagePilot, dan rendering PDF.js di Control, Audience, dan Confidence.
- **Gambar** (PNG, JPEG, WebP, GIF, SVG): SUPPORTED untuk upload Google Drive dan rendering langsung di viewer.
- **Video** (MP4, WebM, MOV, dll): SUPPORTED untuk upload Google Drive dan streaming via `<video>` tag.

Untuk input URL eksternal, StagePilot mendukung:
- **PDF** dari Google Drive atau URL publik
- **Video** dari YouTube, Vimeo, atau URL streaming publik
- **Canva** designs via embed URL
- **Google Slides** presentations via Google Docs embed

Catatan: PPTX tidak lagi didukung untuk upload file. Konversi PPTX ke PDF melalui Google Drive tidak stabil dan mudah gagal.

## Google Drive Storage Flow

Upload file berjalan melalui `/api/material/upload`, divalidasi berdasarkan tipe file (PDF, gambar, atau video), disimpan oleh `GoogleDriveStorageProvider`, lalu metadata disimpan di `material_registry`. Registry menyimpan `storage_provider = google_drive`, `storage_reference = Google Drive file ID`, `material_type` (pdf/image/video), `room_code`, `owner_user_id`, `mime_type`, `size_bytes`, `slide_count`, status, dan TTL.

StagePilot tidak membuat file Google Drive menjadi publik. `Material.url` menggunakan endpoint StagePilot `/api/material/asset?materialId=...&roomCode=...`; display menambahkan `deviceId` saat render agar endpoint dapat memvalidasi room dan device approval. File bytes mengalir dari Google Drive ke endpoint asset lalu ke client (PDF.js untuk PDF, `<img>` untuk gambar, atau `<video>` untuk video). File binary tidak disimpan di D1, Durable Object, atau WebSocket.

Untuk input URL eksternal, flow berbeda: `/api/material/url` menerima URL, memvalidasi tipe (Canva, YouTube, Google Slides, Google Drive PDF, atau URL publik), mengekstrak metadata, lalu menyimpan referensi URL di D1 tanpa meng-copy file.

Jika material kedaluwarsa, room salah, device belum approved, koneksi Google Drive gagal, atau file Drive terhapus, endpoint asset menolak akses dengan error StagePilot yang aman tanpa mengekspos credential Google.

## 1. Buat Google Cloud Project

1. Buka Google Cloud Console.
2. Buat project baru atau pilih project StagePilot.
3. Aktifkan Google Drive API.
4. Buka OAuth consent screen, pilih External atau Internal sesuai akun, lalu isi app name dan email support.
5. Tambahkan scope:

```text
https://www.googleapis.com/auth/drive.file
```

## 2. Buat OAuth Client

1. Buka Credentials.
2. Pilih Create Credentials, lalu OAuth client ID.
3. Pilih Web application.
4. Tambahkan Authorized redirect URI:

```text
http://localhost:3000/api/google-drive/callback
https://DOMAIN_STAGEPILOT_ANDA/api/google-drive/callback
```

5. Simpan Client ID dan Client Secret.

## 3. Konfigurasi Local Development

Buat file `.dev.vars` di root repo:

```text
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_OAUTH_STATE_SECRET="isi-random-panjang"
```

Jalankan migration agar tabel OAuth transaction tersedia:

```bash
npm run db:migrate:local
```

Jalankan aplikasi lokal:

```bash
npm run dev
```

Login sebagai host, buka dashboard, lalu klik Connect Google Drive. Setelah callback sukses, salin refresh token yang tampil dan tambahkan ke `.dev.vars`:

```text
GOOGLE_REFRESH_TOKEN="..."
```

Restart dev server.

## 4. Konfigurasi Production Cloudflare

Simpan semua credential sensitif sebagai Worker Secret:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_OAUTH_STATE_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

Jalankan migration remote setelah deploy konfigurasi database:

```bash
npm run db:migrate:remote
```

Jangan simpan nilai tersebut di `wrangler.jsonc`, source code, browser storage, atau D1.

## 5. Verifikasi

1. Buka dashboard StagePilot.
2. Pastikan Material Storage menampilkan Google Drive connected.
3. Buat room.
4. Upload PDF atau gambar (PNG, JPEG, WebP) dari Control Room.
5. Cek Google Drive operator folder structure:

```text
StagePilot/Rooms/{ROOM_CODE}/
```

6. Pastikan D1 hanya menyimpan metadata dan `storage_reference` berupa Google Drive file ID.
7. Buka Audience, Confidence, dan Control Presentation untuk memastikan material bisa dimuat dan dirender dengan benar.
8. Test URL input dengan link Canva atau Google Slides untuk memastikan external URL registration bekerja.

## 6. Troubleshooting

Jika upload menampilkan Google Drive belum tersambung, pastikan `GOOGLE_REFRESH_TOKEN` sudah tersimpan dan server sudah direstart atau Worker sudah dideploy ulang.

Jika callback tidak memberi refresh token, ulangi Connect Google Drive. Flow memakai `prompt=consent` agar Google mengirim refresh token baru.
