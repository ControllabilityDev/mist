'use client';

import { useState, useMemo } from 'react';
import debounce from 'lodash/debounce';
import axios from 'axios';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const GEO_URL = process.env.NEXT_PUBLIC_GEO_URL ?? 'https://api.openweathermap.org/geo/1.0/direct';

type Hit = { name: string; country: string; lat: number; lon: number };

export default function LocationSearch() {
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  // The provider's geocoding endpoint, called from the component. debounce is
  // the second of the two lodash functions this application uses.
  const search = useMemo(
    () =>
      debounce(async (q: string) => {
        if (q.length < 3) return setHits([]);
        const { data } = await axios.get(GEO_URL, {
          params: { q, limit: 5, appid: process.env.NEXT_PUBLIC_WEATHER_API_KEY },
        });
        setHits(data);
      }, 400),
    [],
  );

  async function choose(label: string, latitude: number, longitude: number) {
    setBusy(true);
    await axios.post(`${API}/locations`, { label, latitude, longitude });
    window.location.reload();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return alert('This browser has no geolocation.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => choose('My location', pos.coords.latitude, pos.coords.longitude),
      () => { setBusy(false); alert('Could not get your location.'); },
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <TextField
          size="small" fullWidth placeholder="Search for a place…"
          onChange={(e) => search(e.target.value)}
        />
        <Button variant="outlined" onClick={useMyLocation} disabled={busy}>
          Use my location
        </Button>
      </div>
      {hits.length > 0 && (
        <List dense sx={{ bgcolor: '#fff', border: '1px solid #e3e6ea', borderRadius: 2 }}>
          {hits.map((h) => (
            <ListItemButton key={`${h.lat},${h.lon}`} onClick={() => choose(`${h.name}, ${h.country}`, h.lat, h.lon)}>
              {h.name}, {h.country}
            </ListItemButton>
          ))}
        </List>
      )}
    </div>
  );
}
