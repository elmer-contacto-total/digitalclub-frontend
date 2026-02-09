const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

// ── BMP writer (24-bit, bottom-up, no compression) ──────────────────────────
function rgbaToBmp(rgbaBuffer, width, height) {
  const rowBytes = width * 3;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const stride = rowBytes + rowPadding;
  const pixelDataSize = stride * height;
  const fileSize = 14 + 40 + pixelDataSize;

  const bmp = Buffer.alloc(fileSize);
  let o = 0;

  // ── BITMAPFILEHEADER (14 bytes) ──
  bmp.write('BM', o); o += 2;
  bmp.writeUInt32LE(fileSize, o); o += 4;
  bmp.writeUInt16LE(0, o); o += 2; // reserved
  bmp.writeUInt16LE(0, o); o += 2; // reserved
  bmp.writeUInt32LE(14 + 40, o); o += 4; // pixel data offset

  // ── BITMAPINFOHEADER (40 bytes) ──
  bmp.writeUInt32LE(40, o); o += 4; // header size
  bmp.writeInt32LE(width, o); o += 4;
  bmp.writeInt32LE(height, o); o += 4; // positive = bottom-up
  bmp.writeUInt16LE(1, o); o += 2; // planes
  bmp.writeUInt16LE(24, o); o += 2; // bits per pixel
  bmp.writeUInt32LE(0, o); o += 4; // compression (none)
  bmp.writeUInt32LE(pixelDataSize, o); o += 4;
  bmp.writeInt32LE(2835, o); o += 4; // h-res (72 dpi)
  bmp.writeInt32LE(2835, o); o += 4; // v-res (72 dpi)
  bmp.writeUInt32LE(0, o); o += 4; // colors used
  bmp.writeUInt32LE(0, o); o += 4; // important colors

  // ── Pixel data (RGBA top-down → BGR bottom-up) ──
  const pad = Buffer.alloc(rowPadding);
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = rgbaBuffer[srcIdx];
      const g = rgbaBuffer[srcIdx + 1];
      const b = rgbaBuffer[srcIdx + 2];
      bmp[o++] = b;
      bmp[o++] = g;
      bmp[o++] = r;
    }
    if (rowPadding > 0) {
      pad.copy(bmp, o);
      o += rowPadding;
    }
  }

  return bmp;
}

// ── SVG templates ───────────────────────────────────────────────────────────

function sidebarSvg(iconBase64) {
  return `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="164" height="314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="314" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <!-- Background gradient -->
  <rect width="164" height="314" fill="url(#bg)"/>

  <!-- App icon -->
  <image x="32" y="60" width="100" height="100"
         href="data:image/png;base64,${iconBase64}"/>

  <!-- Green accent bar -->
  <rect x="20" y="180" width="124" height="4" rx="2" fill="#25D366"/>

  <!-- App name -->
  <text x="82" y="215" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="20"
        font-weight="bold" fill="white" letter-spacing="1">MWS Desktop</text>

  <!-- Subtitle -->
  <text x="82" y="238" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="13"
        fill="#94a3b8">Monitor WhatsApp</text>

  <!-- Bottom accent line -->
  <rect x="40" y="290" width="84" height="2" rx="1" fill="#128C7E" opacity="0.6"/>
</svg>`;
}

function headerSvg(iconBase64) {
  return `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="150" height="57">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="150" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="150" height="57" fill="url(#bg)"/>

  <!-- App icon (right side) -->
  <image x="100" y="8" width="40" height="40"
         href="data:image/png;base64,${iconBase64}"/>

  <!-- Green accent bottom -->
  <rect x="0" y="54" width="150" height="3" fill="#25D366"/>
</svg>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function generate() {
  console.log('Generating NSIS installer bitmaps...\n');

  // Read the app icon and embed as base64
  const iconPath = path.join(buildDir, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('ERROR: build/icon.png not found. Run generate-icon.js first.');
    process.exit(1);
  }
  const iconBase64 = fs.readFileSync(iconPath).toString('base64');

  // ── Sidebar BMP (164 x 314) ──
  const sidebarRaw = await sharp(Buffer.from(sidebarSvg(iconBase64)))
    .resize(164, 314)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const sidebarBmp = rgbaToBmp(sidebarRaw, 164, 314);

  fs.writeFileSync(path.join(buildDir, 'installerSidebar.bmp'), sidebarBmp);
  console.log('  Created build/installerSidebar.bmp (164x314)');

  fs.writeFileSync(path.join(buildDir, 'uninstallerSidebar.bmp'), sidebarBmp);
  console.log('  Created build/uninstallerSidebar.bmp (164x314)');

  // ── Header BMP (150 x 57) ──
  const headerRaw = await sharp(Buffer.from(headerSvg(iconBase64)))
    .resize(150, 57)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const headerBmp = rgbaToBmp(headerRaw, 150, 57);

  fs.writeFileSync(path.join(buildDir, 'installerHeader.bmp'), headerBmp);
  console.log('  Created build/installerHeader.bmp (150x57)');

  console.log('\nInstaller bitmap generation complete!');
}

generate().catch(err => {
  console.error('Error generating installer bitmaps:', err);
  process.exit(1);
});
