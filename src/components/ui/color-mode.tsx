import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export interface ColorModeProviderProps {
  children: ReactNode;
}

export function ColorModeProvider({ children }: ColorModeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
