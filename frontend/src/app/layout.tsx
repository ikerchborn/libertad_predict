import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "La Libertad Predict • Planificador Inteligente de Viajes",
  description:
    "Motor predictivo de conveniencia de destinos turísticos, arqueológicos y litorales del departamento de La Libertad.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${jakarta.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col justify-between antialiased selection:bg-moche-500 selection:text-white bg-adobe-bg text-adobe-dark font-sans">
        {children}
      </body>
    </html>
  );
}
