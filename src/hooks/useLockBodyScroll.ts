import { useEffect } from 'react';

/**
 * Custom hook to lock body and html scrolling when a modal is open.
 * Also applies .modal-open to body and html so blur/sticky artifacts are suppressed.
 */
export function useLockBodyScroll(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const originalOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    };
  }, [isLocked]);
}
