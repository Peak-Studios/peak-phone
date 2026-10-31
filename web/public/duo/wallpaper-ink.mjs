const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Return the ink with readable contrast for a sampled wallpaper region. */
export function inkForWallpaperPixels(pixels, width, height, start = 0, end = 1) {
  if (!pixels || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError('Wallpaper pixels need positive integer dimensions.');
  }
  const y0 = clamp(Math.floor(clamp(start, 0, 1) * height), 0, height - 1);
  const y1 = clamp(Math.ceil(clamp(end, 0, 1) * height), y0 + 1, height);
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = (pixels[i + 3] ?? 255) / 255;
      const veil = .08 + .27 * y / Math.max(1, height - 1);
      const linear = [0, 1, 2].map(channel => {
        const base = pixels[i + channel] * alpha + 16 * (1 - alpha);
        const veilChannel = [3, 8, 18][channel];
        const value = (base * (1 - veil) + veilChannel * veil) / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      sum += .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
      count++;
    }
  }
  return count && sum / count > .20 ? 'dark' : 'light';
}

export function wallpaperInkRegions(pixels, width, height) {
  return {
    status: inkForWallpaperPixels(pixels, width, height, 0, .16),
    heading: inkForWallpaperPixels(pixels, width, height, .12, .34),
    grid: inkForWallpaperPixels(pixels, width, height, .36, .9),
  };
}
