import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './pages';
import { LoadingFallback, ErrorBoundary } from './components/ui';

const ImageChat = lazy(() =>
  import('./features/image/ImageChat').then((mod) => ({
    default: mod.ImageChat,
  }))
);

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<ImageChat />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
