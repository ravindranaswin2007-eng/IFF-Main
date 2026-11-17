import { createContext, useContext } from 'react';
import { useLocation } from '@tanstack/react-router';
import { emptyCms, type PhotoSlot } from './cms';
import { photoPlacements, type PhotoPage } from './photos';

export const CmsContext = createContext(emptyCms);
export const useCms = () => useContext(CmsContext);

export function usePagePhotos() {
  const pathname = useLocation({ select: location => location.pathname.replace(/\/$/, '') || '/' });
  const saved = useCms().pages[pathname];
  const placements = photoPlacements[pathname as PhotoPage] ?? [];
  return (slot: PhotoSlot, fallback?: string, alt = '') => saved?.[slot] ??
    placements.find(item => item.slot === slot) ?? { src: fallback, alt };
}

export function usePagePhoto(slot: PhotoSlot, fallback?: string, alt = '') {
  return usePagePhotos()(slot, fallback, alt);
}
