'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Props = { locationId: number; units: string; locale: string; theme: string };

// One component from the library. The library is 69 packages
// (install-ledger.jsonl seq 25). Individually defensible -- nobody writes their
// own accessible modal. Indefensible in aggregate, which is the finding.
export default function SettingsModal({ locationId, units, locale, theme }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ units, locale, theme });
  const [saving, setSaving] = useState(false);

  // The API call lives in the component body. No client object, no seam.
  async function save() {
    setSaving(true);
    await axios.put(`${API}/locations/${locationId}/preferences`, form);
    setSaving(false);
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <Button variant="outlined" size="small" onClick={() => setOpen(true)}>
        Settings
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Settings</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField
            select label="Units" size="small" value={form.units}
            onChange={(e) => setForm({ ...form, units: e.target.value })}
          >
            <MenuItem value="metric">Metric (°C)</MenuItem>
            <MenuItem value="imperial">Imperial (°F)</MenuItem>
          </TextField>
          <TextField
            select label="Language" size="small" value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
          >
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="de">Deutsch</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} variant="contained">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
