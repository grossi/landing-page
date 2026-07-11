import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

// Lazy routes keep the syntax highlighter out of the initial bundle.
const Blog = React.lazy(() => import('pages/Blog'));
const Experience = React.lazy(() => import('pages/Experience'));

function App() {
  return (
    <BrowserRouter>
      <React.Suspense fallback={null}>
        <Routes>
          <Route path="/blog" element={<Blog />} />
          <Route path="/" element={<Experience />} />
          <Route path="/experience" element={<Experience />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}

export default App;
