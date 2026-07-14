const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const decodePng = (input) => {
    if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PRINT_IMAGE_NOT_PNG');
    let offset = 8;
    let header;
    const data = [];
    while (offset + 12 <= input.length) {
        const length = input.readUInt32BE(offset);
        const type = input.toString('ascii', offset + 4, offset + 8);
        const chunk = input.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            header = {
                width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4),
                bitDepth: chunk[8], colorType: chunk[9], interlace: chunk[12],
            };
        } else if (type === 'IDAT') data.push(chunk);
        else if (type === 'IEND') break;
        offset += length + 12;
    }
    if (!header || !header.width || !header.height || header.width > 4096 || header.height > 40000 || header.bitDepth !== 8 || header.interlace !== 0) {
        throw new Error('PRINT_IMAGE_UNSUPPORTED_PNG');
    }
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
    if (!channels) throw new Error('PRINT_IMAGE_UNSUPPORTED_COLOR');
    const stride = header.width * channels;
    const expectedLength = (stride + 1) * header.height;
    if (expectedLength > 64 * 1024 * 1024) throw new Error('PRINT_IMAGE_TOO_LARGE');
    const packed = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: expectedLength });
    if (packed.length !== expectedLength) throw new Error('PRINT_IMAGE_BAD_DATA_LENGTH');
    const pixels = Buffer.alloc(stride * header.height);
    let sourceOffset = 0;
    for (let y = 0; y < header.height; y += 1) {
        const filter = packed[sourceOffset++];
        const rowOffset = y * stride;
        for (let x = 0; x < stride; x += 1) {
            const raw = packed[sourceOffset++];
            const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
            const up = y > 0 ? pixels[rowOffset + x - stride] : 0;
            const upLeft = y > 0 && x >= channels ? pixels[rowOffset + x - stride - channels] : 0;
            const predictor = filter === 0 ? 0
                : filter === 1 ? left
                    : filter === 2 ? up
                        : filter === 3 ? Math.floor((left + up) / 2)
                            : filter === 4 ? paeth(left, up, upLeft) : NaN;
            if (Number.isNaN(predictor)) throw new Error('PRINT_IMAGE_BAD_PNG_FILTER');
            pixels[rowOffset + x] = (raw + predictor) & 0xff;
        }
    }
    return { ...header, channels, pixels };
};

const pngToEscPos = (input, maxWidth = 576) => {
    const image = decodePng(input);
    const width = Math.max(1, Math.min(maxWidth, image.width));
    const height = Math.max(1, Math.round(image.height * width / image.width));
    const chunks = [Buffer.from([0x1b, 0x40, 0x1b, 0x33, 24])];
    for (let y0 = 0; y0 < height; y0 += 24) {
        chunks.push(Buffer.from([0x1b, 0x2a, 33, width & 0xff, (width >> 8) & 0xff]));
        const band = Buffer.alloc(width * 3);
        for (let x = 0; x < width; x += 1) {
            const sourceX = Math.min(image.width - 1, Math.floor(x * image.width / width));
            for (let rowBand = 0; rowBand < 3; rowBand += 1) {
                let value = 0;
                for (let bit = 0; bit < 8; bit += 1) {
                    const y = y0 + rowBand * 8 + bit;
                    if (y >= height) continue;
                    const sourceY = Math.min(image.height - 1, Math.floor(y * image.height / height));
                    const i = (sourceY * image.width + sourceX) * image.channels;
                    const gray = image.colorType === 0 || image.colorType === 4;
                    const r = image.pixels[i];
                    const g = gray ? r : image.pixels[i + 1];
                    const b = gray ? r : image.pixels[i + 2];
                    const alpha = image.colorType === 4 ? image.pixels[i + 1] : image.colorType === 6 ? image.pixels[i + 3] : 255;
                    const luma = ((r * 299 + g * 587 + b * 114) / 1000) * (alpha / 255) + 255 * (1 - alpha / 255);
                    if (luma < 180) value |= 0x80 >> bit;
                }
                band[x * 3 + rowBand] = value;
            }
        }
        chunks.push(band, Buffer.from([0x0a]));
    }
    chunks.push(Buffer.from([0x1b, 0x32, 0x1b, 0x64, 0x05, 0x1d, 0x56, 0x42, 0x00]));
    return Buffer.concat(chunks);
};

module.exports = { decodePng, pngToEscPos };
