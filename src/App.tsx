import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import Blog from 'pages/Blog';
import Experience from 'pages/Experience';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/blog" element={<Blog />} />
        <Route path="/" element={<Experience />} />
        <Route path="/experience" element={<Experience />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
