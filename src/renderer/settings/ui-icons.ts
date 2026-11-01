const professionIcons = {
  PIONEER: new URL('../assets/ui/profession-pioneer.png', import.meta.url).href,
  WARRIOR: new URL('../assets/ui/profession-warrior.png', import.meta.url).href,
  TANK: new URL('../assets/ui/profession-tank.png', import.meta.url).href,
  SNIPER: new URL('../assets/ui/profession-sniper.png', import.meta.url).href,
  CASTER: new URL('../assets/ui/profession-caster.png', import.meta.url).href,
  MEDIC: new URL('../assets/ui/profession-medic.png', import.meta.url).href,
  SUPPORT: new URL('../assets/ui/profession-support.png', import.meta.url).href,
  SPECIAL: new URL('../assets/ui/profession-special.png', import.meta.url).href,
};

export function professionIcon(profession: string): string | null {
  return professionIcons[profession.toUpperCase() as keyof typeof professionIcons] ?? null;
}

export const RESOURCE_ICONS = {
  orundum: new URL('../assets/ui/orundum.png', import.meta.url).href,
  originium: new URL('../assets/ui/originium.png', import.meta.url).href,
};
