import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sparkles, Plus, Settings2, WandSparkles } from 'lucide-react';
import { DarkModeToggle } from '../components/ui';
import { SettingsDrawer } from '../components/image/SettingsDrawer';
import { useImageChat, type UseImageChatReturn } from '../hooks/useImageChat';

export type LayoutOutletContext = UseImageChatReturn;

export function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chat = useImageChat();
  const { newChat, settings, setSettings } = chat;

  const activeModelLabel = settings.model === 'gemini-3-pro-image-preview'
    ? 'Gemini 3 Pro Image'
    : 'Gemini 3.1 Flash Image';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-3 sm:px-5 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="logo-mark">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div className="gemini-title text-xl font-extrabold leading-tight sm:text-2xl">
              AI Studio
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-[var(--text-2)] dark:border-white/10 dark:bg-white/10 md:flex">
              <Sparkles className="h-3.5 w-3.5 text-primary-500" />
              {activeModelLabel}
            </div>
            <button
              type="button"
              onClick={newChat}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-[var(--panel)] px-3 py-2 text-xs font-medium text-[var(--text-1)] transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              新对话
            </button>
            <DarkModeToggle />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-xl border border-black/10 bg-[var(--panel)] p-2.5 text-[var(--text-2)] transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
              aria-label="设置"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[1400px] min-w-0 flex-1 px-2 pb-2 pt-2 sm:px-4 sm:pb-4">
        <Outlet context={chat} />
      </main>

      <SettingsDrawer
        settings={settings}
        onChange={setSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
