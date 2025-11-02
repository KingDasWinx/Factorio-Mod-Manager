import { useEffect } from 'react';

/**
 * Hook personalizado para fechar modais com a tecla ESC
 * @param isOpen - Estado que indica se o modal está aberto
 * @param onClose - Função para fechar o modal
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);
}