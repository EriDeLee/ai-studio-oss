import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './pages';
import { TextToImage, ImageToImage, ImageEdit } from './features/image';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<TextToImage />} />
          <Route path="image-to-image" element={<ImageToImage />} />
          <Route path="edit" element={<ImageEdit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
