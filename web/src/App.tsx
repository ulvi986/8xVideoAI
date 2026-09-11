import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import TopNav from './components/TopNav';
import Landing from './pages/Landing';
import Explore from './pages/Explore';
import Community from './pages/Community';
import VideoStudio from './pages/VideoStudio';
import ImageStudio from './pages/ImageStudio';
import AudioStudio from './pages/AudioStudio';
import Pricing from './pages/Pricing';
import Profile from './pages/Profile';
import SignIn from './pages/SignIn';

function NotFound() {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4 text-center">
      <div>
        <h1 className="display text-5xl">Nothing here</h1>
        <p className="mt-2 text-sm text-muted">That page does not exist in this build.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TopNav />
        <main>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/community" element={<Community />} />
            <Route path="/video" element={<VideoStudio />} />
            <Route path="/image" element={<ImageStudio />} />
            <Route path="/audio" element={<AudioStudio />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
