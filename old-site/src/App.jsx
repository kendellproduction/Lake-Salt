import { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';

// Lazy load below-the-fold components for faster initial page load
const Gallery = lazy(() => import('./components/Gallery'));
const Reviews = lazy(() => import('./components/Reviews'));
const WhatSetsUsApart = lazy(() => import('./components/WhatSetsUsApart'));
const Services = lazy(() => import('./components/Services'));
const FAQ = lazy(() => import('./components/FAQ'));
const DryHire = lazy(() => import('./components/DryHire'));
const Contact = lazy(() => import('./components/Contact'));
const Footer = lazy(() => import('./components/Footer'));

// Simple loading placeholder for lazy components
const SectionLoader = () => (
  <div className="min-h-[200px] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

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
        {/* Hero Section - Critical, loaded immediately */}
        <Hero />

        {/* Below-the-fold content - lazy loaded for performance */}
        <Suspense fallback={<SectionLoader />}>
          {/* Gallery (Moved up) */}
          <Gallery />

          {/* Reviews (Moved up) */}
          <Reviews />

          {/* What Sets Us Apart */}
          <WhatSetsUsApart />

          {/* Services */}
          <Services />

          {/* FAQ & How It Works */}
          <FAQ />

          {/* Dry Hire Service */}
          <DryHire />

          {/* Contact Form */}
          <Contact />
        </Suspense>
      </main>

      {/* Footer */}
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}