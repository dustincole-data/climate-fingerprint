// pipeline/src/cities.ts

/** A curated city gets its normals from ONE of two sources: a committed T02 probe fixture (the 4 seed cities,
 *  reused verbatim — never refetched) or an Open-Meteo build-time fetch from an explicit `pin` (the other 26). */
export interface CuratedCity {
  slug: string; name: string; region: string; country: string; signature: string;
  /** Reuse a committed T02 fixture in pipeline/fixtures/ — no fetch. */
  fixture?: string;
  /** Explicit geocode pin — lat/lon + IANA tz. Sidesteps the geocoder name collisions (Cairo IL/GA/EG,
   *  Melbourne FL/AU) that T06/T07 §2 warn against for the baked set; the archive fetch needs only these. */
  pin?: { lat: number; lon: number; tz: string };
}

/** Array order IS the gallery-wall order (T05 §gallery: max-contrast, fixed, designed — not random, not spectrum).
 *  Every neighbor is deliberately unlike the last (Phoenix beside Reykjavík, cold beside tropical) so each tile pops. */
export const CURATED_CITIES: CuratedCity[] = [
  { slug: 'fairbanks', name: 'Fairbanks', region: 'AK', country: 'United States', signature: 'savage cold, endless-summer-light swing', pin: { lat: 64.8378, lon: -147.7164, tz: 'America/Anchorage' } },
  { slug: 'singapore', name: 'Singapore', region: '', country: 'Singapore', fixture: 'singapore.json', signature: 'seasonless, hot, wet daily' },
  { slug: 'phoenix', name: 'Phoenix', region: 'AZ', country: 'United States', signature: 'relentless summer furnace', pin: { lat: 33.4484, lon: -112.0740, tz: 'America/Phoenix' } },
  { slug: 'reykjavik', name: 'Reykjavík', region: '', country: 'Iceland', fixture: 'reykjavik.json', signature: 'cold, wet, low-drama, never warm' },
  { slug: 'miami', name: 'Miami', region: 'FL', country: 'United States', signature: 'hot, tropical, wet-season blooms', pin: { lat: 25.7617, lon: -80.1918, tz: 'America/New_York' } },
  { slug: 'denver', name: 'Denver', region: 'CO', country: 'United States', fixture: 'denver.json', signature: 'mile-high, big daily swing, dry' },
  { slug: 'bangkok', name: 'Bangkok', region: '', country: 'Thailand', signature: 'hot, hard wet season', pin: { lat: 13.7563, lon: 100.5018, tz: 'Asia/Bangkok' } },
  { slug: 'minneapolis', name: 'Minneapolis', region: 'MN', country: 'United States', signature: 'brutal winter, warm summer, huge swing', pin: { lat: 44.9778, lon: -93.2650, tz: 'America/Chicago' } },
  { slug: 'dubai', name: 'Dubai', region: '', country: 'United Arab Emirates', signature: 'Gulf furnace, humid heat', pin: { lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' } },
  { slug: 'seattle', name: 'Seattle', region: 'WA', country: 'United States', signature: 'gray, wet, mild', pin: { lat: 47.6062, lon: -122.3321, tz: 'America/Los_Angeles' } },
  { slug: 'honolulu', name: 'Honolulu', region: 'HI', country: 'United States', signature: 'endless warm', pin: { lat: 21.3069, lon: -157.8583, tz: 'Pacific/Honolulu' } },
  { slug: 'boston', name: 'Boston', region: 'MA', country: 'United States', signature: 'cold-snap Northeast', pin: { lat: 42.3601, lon: -71.0589, tz: 'America/New_York' } },
  { slug: 'nairobi', name: 'Nairobi', region: '', country: 'Kenya', signature: 'eternal spring on the equator', pin: { lat: -1.2921, lon: 36.8219, tz: 'Africa/Nairobi' } },
  { slug: 'chicago', name: 'Chicago', region: 'IL', country: 'United States', signature: 'four hard seasons', pin: { lat: 41.8781, lon: -87.6298, tz: 'America/Chicago' } },
  { slug: 'mumbai', name: 'Mumbai', region: '', country: 'India', signature: 'bone-dry, then monsoon deluge', pin: { lat: 19.0760, lon: 72.8777, tz: 'Asia/Kolkata' } },
  { slug: 'san-francisco', name: 'San Francisco', region: 'CA', country: 'United States', signature: 'cool, foggy, dry summer', pin: { lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles' } },
  { slug: 'new-orleans', name: 'New Orleans', region: 'LA', country: 'United States', signature: 'hot, drenching wet season', pin: { lat: 29.9511, lon: -90.0715, tz: 'America/Chicago' } },
  { slug: 'salt-lake-city', name: 'Salt Lake City', region: 'UT', country: 'United States', signature: 'snowy-dry, four seasons', pin: { lat: 40.7608, lon: -111.8910, tz: 'America/Denver' } },
  { slug: 'cairo', name: 'Cairo', region: '', country: 'Egypt', signature: 'Old-World desert, mild winter', pin: { lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo' } },
  { slug: 'melbourne', name: 'Melbourne', region: 'VIC', country: 'Australia', fixture: 'melbourne.json', signature: 'flipped seasons' },
  { slug: 'houston', name: 'Houston', region: 'TX', country: 'United States', signature: 'hot, humid, heavy air', pin: { lat: 29.7604, lon: -95.3698, tz: 'America/Chicago' } },
  { slug: 'albuquerque', name: 'Albuquerque', region: 'NM', country: 'United States', signature: 'high-desert sun, cool nights', pin: { lat: 35.0844, lon: -106.6504, tz: 'America/Denver' } },
  { slug: 'london', name: 'London', region: '', country: 'United Kingdom', signature: 'famously gray, mild, drizzly', pin: { lat: 51.5074, lon: -0.1278, tz: 'Europe/London' } },
  { slug: 'louisville', name: 'Louisville', region: 'KY', country: 'United States', signature: 'four seasons, humid Ohio Valley', pin: { lat: 38.2527, lon: -85.7585, tz: 'America/Kentucky/Louisville' } },
  { slug: 'san-diego', name: 'San Diego', region: 'CA', country: 'United States', signature: 'eternal mild, tiny swing', pin: { lat: 32.7157, lon: -117.1611, tz: 'America/Los_Angeles' } },
  { slug: 'kansas-city', name: 'Kansas City', region: 'MO', country: 'United States', signature: 'storm-season plains, wide swing', pin: { lat: 39.0997, lon: -94.5786, tz: 'America/Chicago' } },
  { slug: 'buenos-aires', name: 'Buenos Aires', region: '', country: 'Argentina', signature: 'flipped, humid subtropical', pin: { lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires' } },
  { slug: 'los-angeles', name: 'Los Angeles', region: 'CA', country: 'United States', signature: 'warm, dry, sunny', pin: { lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' } },
  { slug: 'atlanta', name: 'Atlanta', region: 'GA', country: 'United States', signature: 'long humid summer, mild winter', pin: { lat: 33.7490, lon: -84.3880, tz: 'America/New_York' } },
  { slug: 'new-york', name: 'New York', region: 'NY', country: 'United States', signature: 'four moderated seasons', pin: { lat: 40.7128, lon: -74.0060, tz: 'America/New_York' } },
];
