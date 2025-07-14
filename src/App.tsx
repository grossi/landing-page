import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import About from 'pages/About';
import Blog from 'pages/Blog';
import Projects from 'components/pages/Projects';
import Experience from 'components/pages/Experience';
import Contact from 'components/pages/Contact';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/experience" element={<Experience />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/" element={<Blog />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
