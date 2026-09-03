import axios from 'axios';
import CurrentConditions from './CurrentConditions';
import Forecast, { Slot } from './Forecast';
import SettingsModal from '../../components/SettingsModal';
import LocationSearch from '../../components/LocationSearch';
import { resources } from '../../lib/translations';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PROVIDER_URL = process.env.WEATHER_PROVIDER_URL ?? 'https://api.openweathermap.org/data/2.5';

export const dynamic = 'force-dynamic';

type LocationRow = {
  id: number; label: string; latitude: number; longitude: number;
  prefs: { units: string; locale: string; theme: string }[];
};

export default async function Dashboard() {
  // Data fetching in the page body, straight through axios. Nothing between
  // this component and either the API or the weather provider.
  let locations: LocationRow[] = [];
  try {
    const { data } = await axios.get(`${API}/locations`);
    locations = data;
  } catch {
    locations = [];
  }

  const current = locations[0];
  const units = (current?.prefs?.[0]?.units ?? 'metric') as 'metric' | 'imperial';
  const locale = current?.prefs?.[0]?.locale ?? 'en';
  const t = (k: keyof typeof resources.en.translation) =>
    (resources as any)[locale]?.translation?.[k] ?? resources.en.translation[k];

  let slots: Slot[] = [];
  let offsetSeconds = 0;
  if (current) {
    try {
      const { data } = await axios.get(`${PROVIDER_URL}/forecast`, {
        params: {
          lat: current.latitude, lon: current.longitude,
          appid: process.env.WEATHER_API_KEY, units: 'metric',
        },
      });
      slots = data.list ?? [];
      offsetSeconds = data.city?.timezone ?? 0;
    } catch {
      slots = [];
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        {current && (
          <SettingsModal
            locationId={current.id}
            units={units}
            locale={locale}
            theme={current.prefs?.[0]?.theme ?? 'system'}
          />
        )}
      </header>

      <LocationSearch />

      {!current && <p style={{ color: '#68727d' }}>{t('addLocation')}</p>}

      {current && (
        <>
          <CurrentConditions
            lat={current.latitude}
            lon={current.longitude}
            label={current.label}
            units={units}
            locale={locale}
          />
          {slots.length > 0 && <Forecast slots={slots} units={units} offsetSeconds={offsetSeconds} />}
        </>
      )}
    </main>
  );
}
