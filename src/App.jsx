import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import WhatSetsUsApart from './components/WhatSetsUsApart';
import DryHire from './components/DryHire';
import Gallery from './components/Gallery';
import Services from './components/Services';
import Reviews from './components/Reviews';
import Contact from './components/Contact';
import Footer from './components/Footer';

export default function App() {
  const [navbarBg, setNavbarBg] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setNavbarBg(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="bg-white text-gray-900 overflow-hidden">
      {/* Navbar */}
      <Navbar navbarBg={navbarBg} />

      <main>
        {/* Hero Section */}
        <Hero />

        {/* What Sets Us Apart */}
        <WhatSetsUsApart />

        {/* Dry Hire Service */}
        <DryHire />

        {/* Services */}
        <Services />

        {/* Gallery */}
        <Gallery />

        {/* Reviews */}
        <Reviews />

        {/* Contact Form */}
        <Contact />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
