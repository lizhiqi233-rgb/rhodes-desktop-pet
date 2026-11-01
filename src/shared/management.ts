export const MANAGEMENT_PAGES = ['relations', 'recruitment', 'clues', 'shop', 'dispatch', 'operators', 'furniture', 'settings'] as const;
export type ManagementPage = typeof MANAGEMENT_PAGES[number];

export function isManagementPage(value: unknown): value is ManagementPage {
  return typeof value === 'string' && (MANAGEMENT_PAGES as readonly string[]).includes(value);
}

export type MenuBridge = {
  onSide(listener: (side: 'left' | 'right') => void): () => void;
  openManagementPage(page: ManagementPage): void;
  close(): void;
};
