import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sparkles, Plus, Settings2 } from 'lucide-react';
import { DarkModeToggle } from '../components/ui';
import { SettingsDrawer } from '../components/image/SettingsDrawer';
import { useImageChat } from '../hooks/useImageChat';

export function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { newChat, settings, setSettings } = useImageChat();

  return (
    <div className="h-dvh bg-gray-50 dark:bg-gray-900 transition-colors overflow-hidden flex flex-col overscroll-none" style={{ paddingTop: 'var(--safe-area-inset-top)' }}>
      {/* Header */}
      <header
        className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Studio
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={newChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">新对话</span>
              </button>
              <DarkModeToggle />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
                aria-label="设置"
              >
                <Settings2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Settings drawer */}
      <SettingsDrawer
        settings={settings}
        onChange={setSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
