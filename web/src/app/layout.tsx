import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700', '800'],
  style: ['normal', 'italic'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: 'Agregator Cen Planszówek',
  description: 'Porównaj ceny planszówek w polskich sklepach internetowych',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pl" className={`${playfair.variable} ${dmSans.variable}`}>
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <SiteHeader />
        <main style={{ flex: 1 }}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
