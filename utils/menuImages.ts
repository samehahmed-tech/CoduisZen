// Central fallback for menu-item imagery.
// `public/Default.jpg` is the house dish photo shown for any item that has
// no image of its own. Path is case-sensitive on production servers.
export const DEFAULT_MENU_ITEM_IMAGE = '/Default.jpg';

export const itemImageSrc = (src?: string | null): string =>
    src && src.trim().length > 0 ? src : DEFAULT_MENU_ITEM_IMAGE;
