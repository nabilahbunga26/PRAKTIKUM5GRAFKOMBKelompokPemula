# Praktikum 5 — Textured and Lit Object Playground

**Mata Kuliah:** EF234504 — Grafika Komputer
**Pertemuan 5:** Lighting, Shading & Texture pada WebGL
**Kelompok:** Kelompok Pemula

| Nama | NRP |
|---|---|
| Nabilah Bunga Sulistia | 5025241073 |
| Callista Fidelya Roba Gultom | 5025241086 |

---

## 1. Deskripsi Aplikasi

Playground **WebGL2** untuk mengamati bagaimana **normal, texture (UV), point light, dan camera** memengaruhi tampilan permukaan objek 3D. Objek berputar otomatis dan dirender dengan satu shader program:

- **Vertex shader** mentransformasi posisi (Model → View → Projection), mentransformasi normal dengan **Normal Matrix**, dan meneruskan world position + UV.
- **Fragment shader** melakukan **texture sampling** lalu menghitung **ambient + diffuse + specular** (Phong sederhana) **per fragment**.

Pipeline singkat:

```
Geometry (Kubus / Torus / Torus Knot / Bola)
   ↓
Position + Normal + UV   (3 buffer, 1 VAO per mode flat / smooth)
   ↓
Vertex Shader  → MVP, Normal Matrix, UV × u_uvScale
   ↓
Interpolation  → world position, normal, UV per fragment
   ↓
Fragment Shader → normalize(N), texture, ambient, diffuse, specular
   ↓
Final Surface Color
```

Warna objek memakai tema **pink & putih** (checkerboard putih–pink, image texture bata pink–putih).

---

## 2. Cara Menjalankan

`main.js` memakai ES module, jadi **harus lewat local server** (jangan klik dua kali `index.html`).

```bash
unzip praktikum-lighting-05.zip
cd praktikum-lighting-05
python3 -m http.server 8000      # Windows: python -m http.server 8000
```

Buka `http://localhost:8000` di Chrome / Edge / Firefox terbaru (wajib mendukung WebGL2). Hentikan server dengan `Ctrl + C`.

Alternatif: `npx serve .` atau ekstensi **Live Server** di VS Code.

---

## 3. Struktur File

| File | Fungsi |
|---|---|
| `index.html` | Halaman, panel kontrol, HUD, dan kode GLSL (vertex & fragment shader di tag `<script>`) |
| `style.css` | Tema pink–putih |
| `main.js` | WebGL2: geometry, buffer/VAO, texture, state, input, update, draw, HUD |
| `math3d.js` | Helper matrix 4×4 (`Mat4`), `degToRad`, dan `normalMatrixFromMat4` |
| `assets/texture.png` | Image texture (Challenge A) |
| `README.md` | Dokumen ini |
| `screenshot.png` | Screenshot hasil (ditambahkan sendiri dari browser) |

---

## 4. Penjelasan Semua Kontrol (Panel "PARAMETER CONTROL")

### 4.1 Bentuk objek (dropdown)
Memilih geometry yang dirender. Semua bentuk berupa deretan triangle *non-indexed* yang membawa position, normal flat, normal smooth, dan UV.

| Pilihan | Keterangan | Jumlah vertex |
|---|---|---|
| **Kubus** | 6 face, 36 vertex (default). Normal smooth = arah pusat → sudut, sehingga kubus tampak membulat. | 36 |
| **Torus** | Donat (R = 0.65, r = 0.28). | 12.288 |
| **Torus Knot** | Simpul torus (p = 2, q = 3). | 31.200 |
| **Bola** | Radius 0.85, lat–long. | 15.360 |

> Setelah memilih dropdown, fokus otomatis dilepas supaya tombol keyboard (mis. `S`) tidak "loncat" ke opsi dropdown.

### 4.2 Ambient strength (slider, 0 – 1, default **0.18**)
Mengatur kekuatan cahaya dasar: `ambient = ambientStrength × warnaTexture`. Tidak bergantung normal maupun arah cahaya, sehingga sisi yang membelakangi light tetap sedikit terlihat. Geser ke **0** untuk melihat sisi gelap total; ke **0.4** untuk sisi gelap yang jelas terlihat. Ambient hanya pendekatan sederhana, **bukan** global illumination.

### 4.3 Shininess (slider, 2 – 128, default **32**)
Eksponen pada `pow(max(dot(R, V), 0), shininess)`.
- Nilai **kecil (≈ 8)** → highlight specular **lebar dan lembut**.
- Nilai **besar (≈ 128)** → highlight **kecil dan tajam**.

Ini bukan roughness fisik, hanya eksponen model Phong.

### 4.4 UV Scale (slider, 0.25 – 5, default **1**)
Pengali koordinat UV di vertex shader (`v_texCoord = a_texCoord * u_uvScale`).
- **> 1** → texture mengecil dan berulang lebih banyak. UV keluar dari 0–1 sehingga **efek Wrapping bisa diamati**.
- **< 1** → texture membesar (berguna untuk melihat perbedaan NEAREST vs LINEAR dari dekat).

### 4.5 Light position X / Y / Z (3 slider, -6 s/d 6, default **(2, 2, 3)**)
Posisi point light di world space. Light digambar sebagai **kubus putih kecil** (tanpa lighting) agar posisinya terlihat. Mengubah posisi light akan mengubah arah `L = normalize(lightPos − surfacePos)`, sehingga **diffuse dan specular berubah**. Slider ikut bergerak saat light digeser lewat keyboard atau Light Orbit.

### 4.6 Tombol toggle

| Tombol | Tombol keyboard | Fungsi |
|---|---|---|
| **Flat / Smooth (F)** | `F` | Ganti buffer normal yang aktif. **FLAT** = satu normal per triangle (face normal), perubahan terang antar-face tegas. **SMOOTH** = satu normal per vertex yang diinterpolasi, pencahayaan lebih halus. Geometry **tidak berubah**, hanya normal-nya. Tombol menyala (pink) saat mode SMOOTH. |
| **Texture (T)** | `T` | **ON**: texture dipakai sebagai base color. **OFF**: base color diganti warna pink muda polos, sehingga kontribusi lighting terlihat tanpa pola. HUD menampilkan `OFF`. |
| **Light Orbit (L)** | `L` | Light berputar mengelilingi objek pada bidang XZ (sumbu Y), kecepatan 1.2 rad/detik, dengan radius = jarak light saat ini ke sumbu Y. Tinggi (Y) light tidak berubah dan masih bisa digeser manual. Tekan lagi untuk berhenti. |
| **Camera Orbit** | — | Camera berputar mengelilingi objek (sumbu Y), kecepatan 0.6 rad/detik, tetap menatap pusat. HUD: `ORBIT ON / ORBIT OFF`. Berguna untuk melihat specular bergeser walau light diam. |
| **Stop Object Rotation (P)** | `P` | Menghentikan rotasi otomatis objek (X 20°/detik, Y 35°/detik). Label berubah menjadi *Resume Object Rotation (P)* dan badge status menjadi `ROTATION STOPPED`. |

### 4.7 Texture source (dropdown)
- **Checkerboard** — dibuat programatik lewat canvas 2D (32×32 piksel, 8×8 kotak, putih & pink). Tanpa file eksternal, bebas masalah CORS.
- **Image texture** — memuat `assets/texture.png` (bata pink–putih dengan marker "ITS" dan segitiga, tidak simetris agar mudah melihat jika terbalik). Jika gagal dimuat (mis. dibuka lewat `file://`), dipakai texture cadangan gradasi pink–putih dan peringatan ditulis di Console. Gambar di-upload dengan `UNPACK_FLIP_Y_WEBGL = true`.

### 4.8 Filtering (dropdown)
Aturan sampling saat satu texel tidak persis satu fragment. Diterapkan ke kedua texture.

| Pilihan | MIN filter | MAG filter | Karakter |
|---|---|---|---|
| **LINEAR** (default) | `LINEAR` | `LINEAR` | Interpolasi texel, hasil halus. |
| **NEAREST** | `NEAREST` | `NEAREST` | Ambil texel terdekat; tajam dan *pixelated*. Paling jelas terlihat dengan texture checker 32×32 saat objek dekat / UV Scale kecil. |
| **LINEAR_MIPMAP** | `LINEAR_MIPMAP_LINEAR` | `LINEAR` | Memakai mipmap saat texture terlihat jauh/kecil → mengurangi *shimmering/aliasing*. Bandingkan dengan LINEAR dengan menaikkan UV Scale ke 4–5. |

### 4.9 Wrapping (dropdown)
Perilaku ketika koordinat UV keluar dari 0–1.

| Pilihan | Perilaku |
|---|---|
| **REPEAT** (default) | Pola diulang. |
| **CLAMP_TO_EDGE** | Koordinat dipotong ke tepi, piksel tepi texture "ditarik/diperpanjang" (tampak seperti garis memanjang). |

Catatan: pada **Kubus**, UV dasar hanya 0–1, jadi REPEAT dan CLAMP terlihat sama sampai **UV Scale > 1**. Pada **Torus / Torus Knot / Bola**, UV dasar memang sudah lebih dari 1 (agar kotak texture tampak proporsional), sehingga CLAMP_TO_EDGE langsung terlihat berbeda.

### 4.10 Lighting components (3 checkbox)
Menyalakan/mematikan tiap komponen untuk melihat kontribusinya secara terpisah.

| Checkbox | Rumus | Efek jika dimatikan |
|---|---|---|
| **Ambient** | `ambientStrength × tex` | Sisi yang tidak terkena cahaya menjadi hitam. |
| **Diffuse** | `max(dot(N, L), 0) × lightColor × tex` | Bentuk/volume hilang; hanya ambient + highlight. |
| **Specular** | `pow(max(dot(R, V), 0), shininess) × lightColor` | Highlight mengilap hilang. |

Jika ketiganya dimatikan, badge status menjadi `LIGHTING OFF` dan objek hitam (kecuali ada komponen lain yang menyala).

### 4.11 Non-uniform scale X / Y / Z (3 slider, 0.3 – 2, default **1**)
Mengubah skala objek pada tiap sumbu secara terpisah (skala diterapkan di ruang lokal, sebelum rotasi). Dengan X ≠ Y ≠ Z, normal yang dikali Model Matrix biasa tidak lagi tegak lurus permukaan; **Normal Matrix** (inverse-transpose bagian 3×3 Model Matrix) memperbaikinya sehingga lighting tetap masuk akal. Coba X = 1.8, Y = 0.6, Z = 1.0 seperti Eksperimen 9 pada modul.

### 4.12 Reset Scene (R)
Mengembalikan **semuanya** ke default: bentuk (Kubus), shading (FLAT), texture ON + Checkerboard, LINEAR, REPEAT, ambient 0.18, shininess 32, UV Scale 1, ketiga komponen ON, scale (1,1,1), light (2,2,3), camera awal (0, 1.4, 4), sudut rotasi objek, serta Light Orbit / Camera Orbit OFF dan rotasi berjalan.

---

## 5. Kontrol Keyboard

| Tombol | Fungsi | Jenis |
|---|---|---|
| `←` `→` | Light X − / + | state-based (ditahan = bergerak) |
| `↑` `↓` | Light Y + / − | state-based |
| `W` / `S` | Light Z − / + (menjauhi / mendekati camera) | state-based |
| `Q` / `E` | Camera X − / + | state-based |
| `F` | Flat ↔ Smooth | event-based |
| `T` | Texture ON/OFF | event-based |
| `L` | Light Orbit ON/OFF | event-based |
| `P` | Stop / resume rotasi objek | event-based |
| `R` | Reset scene | event-based |

Tombol diabaikan jika `Ctrl` / `Alt` / `Cmd` ditekan. Posisi light dibatasi -6 sampai 6.

---

## 6. HUD dan Badge Status

Di bawah canvas terdapat chip HUD yang diperbarui tiap frame:

| Chip | Isi |
|---|---|
| **Shading** | `FLAT` / `SMOOTH` |
| **Light** | Posisi light `(x, y, z)` |
| **Texture** | `CHECKER` / `IMAGE` / `OFF` |
| **Filtering** | `LINEAR` / `NEAREST` / `LINEAR_MIPMAP` |
| **Wrapping** | `REPEAT` / `CLAMP_TO_EDGE` |
| **Camera** | `ORBIT ON` / `ORBIT OFF` |
| **Shininess** | Nilai shininess |
| **UV Scale** | Nilai UV scale |

Badge di pojok kanan atas: `RUNNING · LIGHTING ON`. Berubah menjadi `ROTATION STOPPED` saat rotasi dihentikan dan `LIGHTING OFF` saat semua komponen lighting dimatikan.

---

## 7. Detail Teknis

### Jenis shading
- **FLAT** — normal per triangle (face normal). Dua VAO per bentuk: satu memakai buffer normal flat, satu memakai buffer normal smooth, sehingga pergantian cukup `gl.bindVertexArray`.
- **SMOOTH** — normal per vertex. Kubus: arah pusat → sudut. Torus / Knot / Bola: normal analitik permukaan.

### Uniform utama

| Uniform | Fungsi |
|---|---|
| `u_model`, `u_view`, `u_projection` | Matrix transformasi (perspective FOV 60°) |
| `u_normalMatrix` | `mat3` inverse-transpose dari Model Matrix |
| `u_lightPosition`, `u_lightColor` | Point light (putih) |
| `u_cameraPosition` | Untuk view direction `V` |
| `u_ambientStrength`, `u_shininess`, `u_uvScale` | Parameter dari slider |
| `u_texture` | Sampler (texture unit 0) |
| `u_useTexture`, `u_useAmbient`, `u_useDiffuse`, `u_useSpecular` | Toggle |
| `u_unlit` | Menggambar penanda light tanpa lighting |

### Nilai default
- Ambient strength: **0.18**
- Shininess: **32**
- Light position: **(2, 2, 3)**, warna putih
- Camera: **(0, 1.4, 4)** menatap (0, 0, 0)
- Filtering: **LINEAR**, Wrapping: **REPEAT**, Shading: **FLAT**

---

## 8. Challenge yang Dikerjakan

| Challenge | Status | Cara di aplikasi |
|---|---|---|
| A — Image Texture | ✔ | Texture source → *Image texture* (`assets/texture.png`) |
| B — Ambient Control | ✔ | Slider *Ambient strength* (tampil di panel dan nilainya di samping label) |
| C — Camera Control | ✔ | `Q` / `E` dan *Camera Orbit* |
| D — Non-Uniform Scale | ✔ | Slider *Non-uniform scale* X/Y/Z |
| E — Light Orbit | ✔ | Tombol / `L` |
| F — Lighting Components Toggle | ✔ | Checkbox Ambient / Diffuse / Specular |
| G — Mipmap Filtering | ✔ | Filtering → *LINEAR_MIPMAP* |

Tambahan: pilihan 4 bentuk objek, penanda posisi light, dan slider UV Scale.

---

## 9. Panduan Eksperimen

| Eksperimen modul | Cara mencoba |
|---|---|
| 2 — Flat vs Smooth | Tekan `F`. Geometry sama, hanya normal yang berbeda. |
| 3 — Ambient Strength | Geser slider ke 0 / 0.15 / 0.4. |
| 4 — Diffuse (dot N·L) | Gerakkan light dengan Arrow / `W` `S`; cari saat face paling terang (N ≈ L) dan saat gelap (N ⟂ L). |
| 5 — Specular | Shininess 8 / 32 / 128, perhatikan lebar dan ketajaman highlight. |
| 6 — View Direction | Biarkan light diam, tekan `Q` / `E` atau Camera Orbit; highlight bergeser. |
| 7 — NEAREST vs LINEAR | Filtering NEAREST, UV Scale ≈ 0.25–0.5 agar texel besar. |
| 8 — Wrapping | UV Scale > 1 pada Kubus, lalu ganti REPEAT / CLAMP_TO_EDGE. |
| 9 — Normal Matrix | Non-uniform scale X = 1.8, Y = 0.6. |
| 10 — Texture tanpa lighting | Matikan ketiga checkbox Lighting components lalu bandingkan; atau tekan `T` untuk lighting tanpa texture. |

---

## 10. Catatan Debugging

- `#version 300 es` harus karakter pertama shader; shader di `index.html` dibaca dengan `.trim()`.
- Di `main.js`, `state` harus dideklarasikan **sebelum** dipakai `applyTexParams()` (sempat terjadi error *Cannot access before initialization*).
- Layar kosong / error module → dibuka lewat `file://`; gunakan local server.
- Image texture tidak termuat → CORS pada `file://`, pastikan lewat server yang sama; cek Console.
- Wrapping tampak sama → naikkan UV Scale (khusus Kubus).
- Objek gelap total → cek ketiga checkbox lighting, ambient strength, dan posisi light.
- Specular tidak terlihat → pastikan Specular ON, shininess sedang (16–32), light tidak di belakang permukaan.
- Normal harus di-`normalize()` di fragment shader dan ditransformasi dengan Normal Matrix (inverse-transpose), terutama saat non-uniform scale.
