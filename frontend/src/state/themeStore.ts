import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'ayr_theme',
      version: 1,
      // App.jsx stored a plain string ('dark'/'light') under 'ayr_theme'.
      // Zustand persist wraps it in { state: { theme: ... }, version: 1 }.
      // On first load after migration, the old plain-string value will fail
      // JSON.parse as an object, so Zustand falls back to the default ('dark').
      // The migrate function handles the legacy plain-string format.
      migrate: (persisted: unknown, version: number) => {
        if (version === 0) {
          // Old format: plain string stored directly, or already an object
          // from an earlier persist version without versioning
          const legacy = persisted as { theme?: string } | string | null;
          const raw = typeof legacy === 'string' ? legacy : (legacy as { theme?: string })?.theme;
          const theme: Theme = raw === 'light' ? 'light' : 'dark';
          return { theme };
        }
        return persisted as ThemeState;
      },
    }
  )
);
