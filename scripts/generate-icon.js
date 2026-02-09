const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// SVG icon: WhatsApp-style green chat bubble with "MWS" text on dark background
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
    <linearGradient id="bubble" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#25D366"/>
      <stop offset="100%" style="stop-color:#128C7E"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="256" height="256" rx="40" fill="url(#bg)"/>
  <!-- Chat bubble -->
  <path d="M128 48C80.4 48 42 82.5 42 124.8c0 14.8 4.6 28.6 12.6 40.4L44 208l45.2-11.6c11.6 6.2 24.8 9.8 38.8 9.8 47.6 0 86-34.5 86-76.8S175.6 48 128 48z"
        fill="url(#bubble)" opacity="0.95"/>
  <!-- Phone icon in bubble -->
  <path d="M152 99c-2.2-2.2-5.2-5.2-8.4-5.4-3.4-.2-6 1.6-7.8 3.4l-3 3c-.6.6-1.6.8-2.4.4-4.8-2.4-14.2-10-19.6-15.4-5.4-5.4-13-14.8-15.4-19.6-.4-.8-.2-1.8.4-2.4l3-3c1.8-1.8 3.6-4.4 3.4-7.8-.2-3.2-3.2-6.2-5.4-8.4l-5.4-5.4c-2.8-2.8-6.4-5.8-10.2-5.8-4.8 0-9 4-12 7-4 4-6.4 9.4-6.6 15-.4 10.8 5 22.6 15.8 33.4 10.8 10.8 22.6 16.2 33.4 15.8 5.6-.2 11-2.6 15-6.6 3-3 7-7.2 7-12 0-3.8-3-7.4-5.8-10.2L152 99z"
        fill="white" opacity="0.9" transform="translate(28, 52) scale(0.7)"/>
  <!-- MWS text -->
  <text x="128" y="178" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="bold" fill="white" letter-spacing="3">MWS</text>
</svg>`;

async function generateIcon() {
  const outputDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate PNGs at multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = {};

  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers[size] = buf;
    // Also save 256px PNG for electron-builder fallback
    if (size === 256) {
      fs.writeFileSync(path.join(outputDir, 'icon.png'), buf);
      console.log(`  Created build/icon.png (256x256)`);
    }
  }

  // Build ICO file with multiple sizes (PNG-compressed)
  const icoSizes = [16, 32, 48, 256];
  const numImages = icoSizes.length;

  // ICONDIR: 6 bytes
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  // Collect image data and directory entries
  const dirEntries = [];
  const imageDataBuffers = [];

  for (const size of icoSizes) {
    const pngData = pngBuffers[size];
    dirEntries.push({
      width: size >= 256 ? 0 : size,  // 0 means 256
      height: size >= 256 ? 0 : size,
      pngSize: pngData.length,
      offset: dataOffset
    });
    imageDataBuffers.push(pngData);
    dataOffset += pngData.length;
  }

  // Write ICO file
  const totalSize = dataOffset;
  const ico = Buffer.alloc(totalSize);
  let pos = 0;

  // ICONDIR header
  ico.writeUInt16LE(0, pos); pos += 2;      // reserved
  ico.writeUInt16LE(1, pos); pos += 2;      // type: 1 = ICO
  ico.writeUInt16LE(numImages, pos); pos += 2; // count

  // ICONDIRENTRY for each image
  for (let i = 0; i < numImages; i++) {
    const entry = dirEntries[i];
    ico.writeUInt8(entry.width, pos); pos += 1;    // width
    ico.writeUInt8(entry.height, pos); pos += 1;   // height
    ico.writeUInt8(0, pos); pos += 1;              // color palette
    ico.writeUInt8(0, pos); pos += 1;              // reserved
    ico.writeUInt16LE(1, pos); pos += 2;           // color planes
    ico.writeUInt16LE(32, pos); pos += 2;          // bits per pixel
    ico.writeUInt32LE(entry.pngSize, pos); pos += 4; // image size
    ico.writeUInt32LE(entry.offset, pos); pos += 4;  // offset
  }

  // Image data
  for (const buf of imageDataBuffers) {
    buf.copy(ico, pos);
    pos += buf.length;
  }

  const icoPath = path.join(outputDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`  Created build/icon.ico (${icoSizes.join(', ')}px)`);

  // Also copy to public/ to replace old favicon
  const publicIcoPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  fs.writeFileSync(publicIcoPath, ico);
  console.log(`  Updated public/favicon.ico`);

  console.log('\nIcon generation complete!');
}

generateIcon().catch(err => {
  console.error('Error generating icon:', err);
  process.exit(1);
});
