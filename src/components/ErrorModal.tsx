import { X, AlertCircle, Copy, Download } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: {
    title: string;
    message: string;
    details?: string;
    stack?: string;
    timestamp: Date;
  };
}

export default function ErrorModal({ isOpen, onClose, error }: ErrorModalProps) {
  // Hook para fechar modal com ESC
  useEscapeKey(isOpen, onClose);
  
  if (!isOpen) return null;

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const copyErrorToClipboard = async () => {
    const errorText = `
=== ERRO DO MOD MANAGER ===
Título: ${error.title}
Mensagem: ${error.message}
Horário: ${formatTimestamp(error.timestamp)}

${error.details ? `Detalhes: ${error.details}` : ''}

${error.stack ? `Stack Trace:\n${error.stack}` : ''}
`;

    try {
      await navigator.clipboard.writeText(errorText);
      // Aqui poderia ter um toast de sucesso
    } catch (err) {
      console.error('Erro ao copiar para clipboard:', err);
    }
  };

  const downloadErrorLog = () => {
    const errorText = `
=== ERRO DO MOD MANAGER ===
Título: ${error.title}
Mensagem: ${error.message}
Horário: ${formatTimestamp(error.timestamp)}

${error.details ? `Detalhes: ${error.details}` : ''}

${error.stack ? `Stack Trace:\n${error.stack}` : ''}
`;

    const blob = new Blob([errorText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="error-modal-overlay" onClick={onClose}>
      <div className="error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="error-modal-header">
          <div className="error-modal-title">
            <AlertCircle className="error-icon" size={24} />
            <h2>Erro Detectado</h2>
          </div>
          <button onClick={onClose} className="error-modal-close">
            <X size={20} />
          </button>
        </div>

        <div className="error-modal-content">
          <div className="error-section">
            <h3>Título do Erro</h3>
            <p className="error-title-text">{error.title}</p>
          </div>

          <div className="error-section">
            <h3>Mensagem</h3>
            <p className="error-message-text">{error.message}</p>
          </div>

          <div className="error-section">
            <h3>Horário</h3>
            <p className="error-timestamp">{formatTimestamp(error.timestamp)}</p>
          </div>

          {error.details && (
            <div className="error-section">
              <h3>Detalhes Técnicos</h3>
              <pre className="error-details">{error.details}</pre>
            </div>
          )}

          {error.stack && (
            <div className="error-section">
              <h3>Stack Trace</h3>
              <pre className="error-stack">{error.stack}</pre>
            </div>
          )}
        </div>

        <div className="error-modal-actions">
          <button onClick={copyErrorToClipboard} className="btn-error-action">
            <Copy size={16} />
            Copiar Erro
          </button>
          <button onClick={downloadErrorLog} className="btn-error-action">
            <Download size={16} />
            Baixar Log
          </button>
          <button onClick={onClose} className="btn-error-close">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
