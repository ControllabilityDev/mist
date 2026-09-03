import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mist — Weather',
  description: 'A weather dashboard.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f6f7f9' }}>
        {children}
      </body>
    </html>
  );
}
