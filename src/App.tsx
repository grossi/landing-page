import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import About from 'pages/About';
import Blog from 'pages/Blog';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="/" element={<Blog />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
