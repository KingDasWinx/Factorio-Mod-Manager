import { ActiveTab } from "../types";
import AllModsView from './AllModsView';
import MyModsView from './MyModsView';
import ConfigView from './ConfigView';
import DownloadQueueView from './DownloadQueue';
import ModDetailsView from './ModDetailsView';
import type { ModDetailsOpenPayload } from './ModDetailsView';

interface MainContentProps {
  activeTab: ActiveTab;
  modDetailsPayload?: ModDetailsOpenPayload | null;
  onBackFromDetails?: () => void;
  onOpenDependency?: (name: string) => void;
}

export default function MainContent({ activeTab, modDetailsPayload, onBackFromDetails, onOpenDependency }: MainContentProps) {
  const renderContent = () => {
    switch (activeTab) {
      case 'all-mods':
        return <AllModsView />;
      case 'my-mods':
        return <MyModsView />;
      case 'download-queue':
        return <DownloadQueueView />;
      case 'config':
        return <ConfigView />;
      case 'mod-details':
        if (!modDetailsPayload) return <AllModsView />;
        return (
          <ModDetailsView 
            payload={modDetailsPayload} 
            onBack={onBackFromDetails || (() => {})}
            onOpenDependency={(name) => onOpenDependency && onOpenDependency(name)}
          />
        );
      default:
        return <AllModsView />;
    }
  };

  return (
    <main className="main-container">
      {renderContent()}
    </main>
  );
}
