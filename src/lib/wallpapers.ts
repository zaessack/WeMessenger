export interface WallpaperPreset {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  lightClass: string;
  darkClass: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'default',
    name: 'Pure Glass',
    description: 'Clean translucent Apple canvas',
    lightClass: 'bg-[#F5F6F8]',
    darkClass: 'bg-[#0B0D12]',
  },
  {
    id: 'ios_frost',
    name: 'Liquid Frost',
    description: 'Frosted pearl & pale sky waves',
    imageUrl: '/src/assets/images/wallpaper_ios_frost_1795192407567.jpg',
    lightClass: 'bg-[#EEF3F8]',
    darkClass: 'bg-[#10151C]',
  },
  {
    id: 'ios_obsidian',
    name: 'Obsidian Titanium',
    description: 'Deep midnight glass & titanium folds',
    imageUrl: '/src/assets/images/wallpaper_ios_obsidian_1795192406433.jpg',
    lightClass: 'bg-[#E5E8EE]',
    darkClass: 'bg-[#090B10]',
  },
  {
    id: 'nordic_sky',
    name: 'Nordic Mist',
    description: 'Soft atmospheric gradient',
    lightClass: 'bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50',
    darkClass: 'bg-gradient-to-br from-slate-950 via-[#0E1624] to-zinc-950',
  },
  {
    id: 'warm_alabaster',
    name: 'Warm Studio',
    description: 'Subtle neutral daylight warmth',
    lightClass: 'bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-100',
    darkClass: 'bg-gradient-to-br from-zinc-950 via-neutral-900 to-stone-950',
  },
];

export function getWallpaperById(id?: string): WallpaperPreset {
  return WALLPAPER_PRESETS.find((w) => w.id === id) || WALLPAPER_PRESETS[0];
}
