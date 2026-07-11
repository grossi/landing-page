import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import Experience from 'pages/Experience';

// Blog and the arcade pages are lazy so their chunks (markdown/syntax
// highlighting, three.js) load only on their routes; Experience is the
// landing route and renders without a chunk round-trip.
const Blog = React.lazy(() => import('pages/Blog'));
const Arcade = React.lazy(() => import('pages/Arcade'));
const Ephemeris = React.lazy(() => import('pages/Ephemeris'));

interface ErrorBoundaryState {
  hasError: boolean;
}

// A lazy chunk can fail to load (e.g. a stale tab navigating after a
// redeploy changed asset hashes) — show a reload prompt instead of a
// blank page.
class ChunkErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <p style={{ padding: '2rem', textAlign: 'center' }}>
          Something went wrong loading this page —{' '}
          <a href="" style={{ textDecoration: 'underline' }}>reload</a>.
        </p>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <BrowserRouter>
      <ChunkErrorBoundary>
        <React.Suspense fallback={null}>
          <Routes>
            <Route path="/blog" element={<Blog />} />
            <Route path="/arcade" element={<Arcade />} />
            <Route path="/ephemeris" element={<Ephemeris />} />
            <Route path="/" element={<Experience />} />
            <Route path="/experience" element={<Experience />} />
          </Routes>
        </React.Suspense>
      </ChunkErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
