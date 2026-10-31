const fs = require('node:fs');

// The reviewed offsets/hash were produced from the original Windows bundle.
// Reconstruct that exact representation after Git converts a checkout to LF;
// do not change the golden hash or accept any other source edits.
const canonicalLegacySource = text => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
const readLegacySource = filename => canonicalLegacySource(fs.readFileSync(filename, 'utf8'));
module.exports = { canonicalLegacySource, readLegacySource };
