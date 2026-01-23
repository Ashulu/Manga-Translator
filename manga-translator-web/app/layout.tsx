import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";

// 1. Action Man (The Superhero look)
const actionMan = localFont({
  src: [
    { path: './fonts/ActionMan.ttf', weight: '400', style: 'normal' },
    { path: './fonts/ActionManBold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/ActionManItalic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-action-man',
});

// 2. Anime Ace (The Standard Manga look)
const animeAce = localFont({
  src: [
    { path: './fonts/animeace2_reg.ttf', weight: '400', style: 'normal' },
    { path: './fonts/animeace2_bld.ttf', weight: '700', style: 'normal' },
    { path: './fonts/animeace2_ital.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-anime-ace',
});

// 3. Smack Attack (The "Loud" look)
const smackAttack = localFont({
  src: [
    { path: './fonts/smackattackbb_reg.ttf', weight: '400', style: 'normal' },
    { path: './fonts/smackattackbb_bld.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-smack-attack',
});

export const metadata: Metadata = {
  title: "Manga Translator",
  description: "AI-powered typesetter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Inject ALL font variables into the body */}
      <body className={`${actionMan.variable} ${animeAce.variable} ${smackAttack.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}