import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Base Coat Attribution Dashboard',
  description: 'Client-scoped source performance dashboard.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
