export const CLOCK_CITIES = Object.freeze([
  { id: 'los-santos', name: 'Los Santos', zone: 'America/Los_Angeles', kind: 'fictional' },
  { id: 'san-fierro', name: 'San Fierro', zone: 'America/Los_Angeles', kind: 'fictional' },
  { id: 'las-venturas', name: 'Las Venturas', zone: 'America/Los_Angeles', kind: 'fictional' },
  { id: 'paleto-bay', name: 'Paleto Bay', zone: 'America/Los_Angeles', kind: 'fictional' },
  { id: 'sandy-shores', name: 'Sandy Shores', zone: 'America/Los_Angeles', kind: 'fictional' },
  { id: 'liberty-city', name: 'Liberty City', zone: 'America/New_York', kind: 'fictional' },
  { id: 'vice-city', name: 'Vice City', zone: 'America/New_York', kind: 'fictional' },
  { id: 'carcer-city', name: 'Carcer City', zone: 'America/Detroit', kind: 'fictional' },
  { id: 'ludendorff', name: 'Ludendorff', zone: 'America/Chicago', kind: 'fictional' },
  { id: 'real-new-york', name: 'New York', zone: 'America/New_York', kind: 'real' },
  { id: 'real-london', name: 'London', zone: 'Europe/London', kind: 'real' },
  { id: 'real-paris', name: 'Paris', zone: 'Europe/Paris', kind: 'real' },
  { id: 'real-tokyo', name: 'Tokyo', zone: 'Asia/Tokyo', kind: 'real' },
  { id: 'real-sydney', name: 'Sydney', zone: 'Australia/Sydney', kind: 'real' },
  { id: 'real-los-angeles', name: 'Los Angeles', zone: 'America/Los_Angeles', kind: 'real' },
  { id: 'real-new-delhi', name: 'New Delhi', zone: 'Asia/Kolkata', kind: 'real' },
  { id: 'real-hong-kong', name: 'Hong Kong', zone: 'Asia/Hong_Kong', kind: 'real' },
  { id: 'real-rio', name: 'Rio de Janeiro', zone: 'America/Sao_Paulo', kind: 'real' },
  { id: 'real-mexico-city', name: 'Mexico City', zone: 'America/Mexico_City', kind: 'real' },
  { id: 'real-cape-town', name: 'Cape Town', zone: 'Africa/Johannesburg', kind: 'real' },
  { id: 'real-stockholm', name: 'Stockholm', zone: 'Europe/Stockholm', kind: 'real' },
  { id: 'real-hawaii', name: 'Hawaii', zone: 'Pacific/Honolulu', kind: 'real' },
]);

export const DEFAULT_CLOCK_CITIES = Object.freeze(['los-santos', 'liberty-city', 'vice-city']);

const cityIds = new Set(CLOCK_CITIES.map(city => city.id));
const legacyZoneIds = Object.freeze({ 'America/Los_Angeles': 'los-santos', 'America/New_York': 'liberty-city' });

export function isClockCityId(id) { return cityIds.has(id); }

export function normalizeClockCities(value) {
  if (!Array.isArray(value)) return [...DEFAULT_CLOCK_CITIES];
  return [...new Set(value.map(city => legacyZoneIds[city] || city).filter(isClockCityId))].slice(0, CLOCK_CITIES.length);
}
