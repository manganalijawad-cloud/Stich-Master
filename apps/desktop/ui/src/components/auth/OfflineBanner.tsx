import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 bg-amber-500/90 text-white px-4 py-2 text-sm font-semibold backdrop-blur-sm animate-fade-in">
      <WifiOff className="icon-sm shrink-0" />
      <span>No Internet Connection — changes will sync when you're back online</span>
    </div>
  );
}
