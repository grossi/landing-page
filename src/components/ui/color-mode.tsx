import React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { Button } from '@chakra-ui/react';
import { Moon, Sun } from 'lucide-react';

export interface ColorModeProviderProps {
  children: React.ReactNode;
}

export function ColorModeProvider({ children }: ColorModeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export function useColorMode() {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  
  return {
    colorMode: resolvedTheme || 'light',
    toggleColorMode: () => {
      if (theme === 'system') {
        // If currently using system theme, switch to the opposite of resolved theme
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
      } else {
        // Otherwise, just toggle between light and dark
        setTheme(theme === 'dark' ? 'light' : 'dark');
      }
    },
    setColorMode: setTheme,
  };
}

export function useColorModeValue<T>(light: T, dark: T): T {
  const { resolvedTheme } = useNextTheme();
  return resolvedTheme === 'dark' ? dark : light;
}

export function ColorModeButton() {
  const { colorMode, toggleColorMode } = useColorMode();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Button onClick={toggleColorMode} variant="ghost">
      {colorMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </Button>
  );
}