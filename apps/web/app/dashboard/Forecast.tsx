'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import groupBy from 'lodash/groupBy';
import moment from 'moment-timezone';

export type Slot = { dt: number; main: { temp: number }; weather: { description: string }[] };

type Props = { slots: Slot[]; units: 'metric' | 'imperial'; offsetSeconds: number };

export default function Forecast({ slots, units, offsetSeconds }: Props) {
  const toDisplay = (c: number) => (units === 'imperial' ? (c * 9) / 5 + 32 : c);
  const degrees = units === 'imperial' ? '°F' : '°C';
  const at = (dt: number) => moment.unix(dt).utcOffset(offsetSeconds / 60);

  const hourly = slots.slice(0, 12).map((s) => ({
    label: at(s.dt).format('HH:mm'),
    temp: Number(toDisplay(s.main.temp).toFixed(1)),
  }));

  // The one place in this application with real logic in it: bucket the
  // provider's three-hourly slots into days and take each day's high and low.
  // lodash.groupBy is carried for this call; Object.groupBy would have done it.
  const byDay = groupBy(slots, (s: Slot) => at(s.dt).format('ddd'));
  const daily = Object.entries(byDay).map(([day, entries]) => {
    const temps = (entries as Slot[]).map((e) => toDisplay(e.main.temp));
    return {
      day,
      high: Number(Math.max(...temps).toFixed(1)),
      low: Number(Math.min(...temps).toFixed(1)),
    };
  });

  return (
    <>
      <section style={card}>
        <h3 style={heading}>Next 12 slots ({degrees})</h3>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={hourly}>
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} width={38} />
              <Tooltip />
              <Line type="monotone" dataKey="temp" stroke="#2f6fd0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={card}>
        <h3 style={heading}>The week ({degrees})</h3>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={daily}>
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} width={38} />
              <Tooltip />
              <Bar dataKey="high" fill="#e08a3c" />
              <Bar dataKey="low" fill="#7aa7dd" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}

const card = {
  background: '#fff',
  border: '1px solid #e3e6ea',
  borderRadius: 12,
  padding: '16px 20px',
  marginBottom: 20,
} as const;

const heading = { margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#33383d' } as const;

// Exported so the one test with real logic in it can reach the bucketing.
// Duplicated from the component body on purpose: extracting it would create the
// seam this application is specified not to have.
export function bucketIntoDays(slots: Slot[], offsetSeconds: number, units: 'metric' | 'imperial') {
  const toDisplay = (c: number) => (units === 'imperial' ? (c * 9) / 5 + 32 : c);
  const at = (dt: number) => moment.unix(dt).utcOffset(offsetSeconds / 60);
  const byDay = groupBy(slots, (s: Slot) => at(s.dt).format('ddd'));
  return Object.entries(byDay).map(([day, entries]) => {
    const temps = (entries as Slot[]).map((e) => toDisplay(e.main.temp));
    return { day, high: Math.max(...temps), low: Math.min(...temps) };
  });
}
