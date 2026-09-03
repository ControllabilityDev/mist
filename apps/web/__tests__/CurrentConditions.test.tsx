import { render, screen } from '@testing-library/react';
import axios from 'axios';
import CurrentConditions from '../app/dashboard/CurrentConditions';

jest.mock('axios');
const mockedGet = axios.get as jest.Mock;

// A fixed provider payload, in the provider's wire shape. Synthetic values only
// (EPIC-01 Scope rule 3) and no coordinates are asserted here.
const payload = {
  data: {
    main: { temp: 21.4, feels_like: 20.9 },
    weather: [{ description: 'clear sky' }],
    dt: 1_760_000_000,
    timezone: 3600,
  },
};

const props = { lat: 0, lon: 0, label: 'Test Place', units: 'metric' as const, locale: 'en' };

beforeEach(() => mockedGet.mockReset());

describe('CurrentConditions', () => {
  it('renders the current temperature', async () => {
    mockedGet.mockResolvedValue(payload);
    render(await CurrentConditions(props));
    expect(screen.getByText(/21\.4°C/)).toBeInTheDocument();
  });

  it('renders the place label', async () => {
    mockedGet.mockResolvedValue(payload);
    render(await CurrentConditions(props));
    expect(screen.getByText('Test Place')).toBeInTheDocument();
  });

  it('renders the provider description verbatim', async () => {
    mockedGet.mockResolvedValue(payload);
    render(await CurrentConditions(props));
    expect(screen.getByText(/clear sky/)).toBeInTheDocument();
  });

  it('converts to fahrenheit when the preference says imperial', async () => {
    mockedGet.mockResolvedValue(payload);
    render(await CurrentConditions({ ...props, units: 'imperial' }));
    expect(screen.getByText(/70\.5°F/)).toBeInTheDocument();
  });

  it('flags harsh conditions above 32C', async () => {
    mockedGet.mockResolvedValue({ data: { ...payload.data, main: { temp: 35, feels_like: 38 } } });
    render(await CurrentConditions(props));
    expect(screen.getByText(/dress for it/)).toBeInTheDocument();
  });

  it('does not flag harsh conditions in the comfortable range', async () => {
    mockedGet.mockResolvedValue(payload);
    render(await CurrentConditions(props));
    expect(screen.queryByText(/dress for it/)).toBeNull();
  });

  it('calls the provider with the coordinates it was given', async () => {
    mockedGet.mockResolvedValue(payload);
    await CurrentConditions({ ...props, lat: 12, lon: 34 });
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/weather'),
      expect.objectContaining({ params: expect.objectContaining({ lat: 12, lon: 34 }) }),
    );
  });
});
