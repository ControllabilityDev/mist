import axios from 'axios';
import moment from 'moment-timezone';

const PROVIDER_URL = process.env.WEATHER_PROVIDER_URL ?? 'https://api.openweathermap.org/data/2.5';

type Props = { lat: number; lon: number; label: string; units: 'metric' | 'imperial'; locale: string };

export default async function CurrentConditions({ lat, lon, label, units, locale }: Props) {
  // No port. No adapter. No injection. The component IS the integration.
  let data: any;
  try {
    const res = await axios.get(`${PROVIDER_URL}/weather`, {
      params: { lat, lon, appid: process.env.WEATHER_API_KEY, units: 'metric' },
    });
    data = res.data;
  } catch (err: any) {
    // The provider is unreachable or the key is missing. Show the failure rather
    // than crash the page. Note where this handler lives: in the view, beside
    // the rendering, because there is no layer between the two to put it in.
    const why =
      err?.response?.status === 401
        ? 'WEATHER_API_KEY is not set or not valid.'
        : 'The weather provider could not be reached.';
    return (
      <section style={{ ...shell, background: '#fffbe9', borderColor: '#e0d3a4' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{label}</h2>
        <p style={{ margin: 0, color: '#7a6a34', fontSize: 14 }}>{why}</p>
      </section>
    );
  }

  // Business rules, computed inline, in the view. There is no domain type for
  // any of this: the provider's wire shape is the model.
  const celsius = data.main.temp as number;
  const feelsLike = data.main.feels_like as number;
  const feelsHarsh = feelsLike > 32 || feelsLike < -5;

  // Unit conversion as an inline helper in the view layer, reading the stored
  // preference. Deliberately not extracted (EPIC-02 Scope rule 3).
  const toDisplay = (c: number) => (units === 'imperial' ? c * 9 / 5 + 32 : c);
  const degrees = units === 'imperial' ? '°F' : '°C';

  // Timezone handling, also inline. data.timezone is the provider's offset in
  // seconds; moment-timezone is carried for exactly this one call.
  const observedAt = moment
    .unix(data.dt as number)
    .utcOffset((data.timezone as number) / 60)
    .locale(locale)
    .format('LT');

  return (
    <section
      style={{
        ...shell,
        background: feelsHarsh ? '#fff4f4' : '#ffffff',
        borderColor: feelsHarsh ? '#e0b4b4' : '#e3e6ea',
      }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{label}</h2>
      <p style={{ margin: '0 0 12px', color: '#68727d', fontSize: 13 }}>
        {data.weather?.[0]?.description ?? 'no description'} · observed {observedAt}
      </p>
      <p style={{ margin: 0, fontSize: 46, fontWeight: 300, lineHeight: 1 }}>
        {toDisplay(celsius).toFixed(1)}
        {degrees}
      </p>
      <p style={{ margin: '8px 0 0', color: '#68727d', fontSize: 14 }}>
        Feels like {toDisplay(feelsLike).toFixed(1)}
        {degrees}
        {feelsHarsh ? ' — dress for it.' : ''}
      </p>
    </section>
  );
}

const shell = {
  border: '1px solid #e3e6ea',
  borderRadius: 12,
  padding: '20px 24px',
  marginBottom: 20,
} as const;
