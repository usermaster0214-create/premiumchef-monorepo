import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PremiumChef | Catálogo',
  description: 'Gestão de catálogo e cardápio PremiumChef.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}