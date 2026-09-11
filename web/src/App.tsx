import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import Nav from './components/Nav';
import Home from './pages/Home';
import Studio from './pages/Studio';
import Community from './pages/Community';
import Library from './pages/Library';
import Pricing from './pages/Pricing';
import SignIn from './pages/SignIn';

function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-[820px] place-items-center px-5 text-center">
      <div>
        <h1 className="h text-[20px]">Nothing here</h1>
        <p className="mt-1.5 text-[13px] text-muted">That page does not exist.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        {/* Offset the fixed rail on desktop; the mobile bar is handled by page padding. */}
        <main className="md:pl-[228px]">
          <Routes>
            <Route path="/" element={<Home />} />
            {/* One component serves all three; the route only sets the mode.
                Listed explicitly rather than as "/:kind" so an unknown path
                still reaches the 404 instead of silently opening the studio. */}
            <Route path="/video" element={<Studio kind="video" />} />
            <Route path="/image" element={<Studio kind="image" />} />
            <Route path="/audio" element={<Studio kind="audio" />} />
            <Route path="/community" element={<Community />} />
            <Route path="/library" element={<Library />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/signin" element={<SignIn />} />
            {/* The profile page became the library. */}
            <Route path="/profile" element={<Navigate to="/library" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
