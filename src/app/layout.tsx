import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from "next/font/google";
import { Alumni_Sans_SC } from "next/font/google";
import { DM_Sans } from 'next/font/google'
import './globals.css'
import '../styles/quill-content.css'
import Providers from './providers/Providers'
import { Zoom, ToastContainer } from 'react-toastify'
import BackgroundOverlay from '@/components/ui/BackgroundOverlay'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-dm-sans'
})

const alumniSans = Alumni_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '700'], // Alumni Sans SC only supports 400 and 700
  variable: '--font-alumni-sans',
  display: 'swap'
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta'
})

export const metadata: Metadata = {
  title: 'Young Pro',
  description:
    'Helping young professionals find jobs, build networks, and grow their careers.',
  verification: {
    google: '4BZ5fgUdJE-0Qgbr504sRbXCKJCk7kpzAvAhbpHoLH0',
  },
}

export default function RootLayout ({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    // Read theme_settings cookie (API value: 0=dark, 1=light, 2=system)
    var m = document.cookie.match(/(?:^|;\\s*)theme_settings=(\\d)/);
    var map = {'0':'dark','1':'light','2':'system'};
    var pref = m ? (map[m[1]] || 'dark') : 'dark';
    var isDark = pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    // Read the yp_auth_hint cookie so the account-only nav (Notifications)
    // renders correctly on first paint — no flash for returning logged-in users.
    var m = document.cookie.match(/(?:^|;\\s*)yp_auth_hint=(authed|anon)/);
    if (m && m[1] === 'authed') {
      document.documentElement.classList.add('yp-authed');
    } else {
      document.documentElement.classList.remove('yp-authed');
    }
  } catch(e) {}
})();
`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${alumniSans.variable} ${plusJakarta.variable} antialiased`}
        style={{ overflowX: 'hidden', paddingRight: '0px !important' }}
      >
        <BackgroundOverlay />
        <Providers>{children}</Providers>
        {/* {children} */}

        {/* Toast Container for toast messages */}
        <ToastContainer
          position='top-right'
          autoClose={3000}
          hideProgressBar
          newestOnTop={true}
          closeOnClick={false}
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme='#FFF'
          transition={Zoom}
          
        />
      </body>
    </html>
  )
}
