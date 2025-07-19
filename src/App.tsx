import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import About from 'pages/About';
import Blog from 'pages/Blog';
import Projects from 'pages/Projects';
import Experience from 'pages/Experience';
import Contact from 'pages/Contact';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/blog" element={<Blog />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/" element={<Experience />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
