import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Wine } from 'lucide-react';

const Navbar = ({ navbarBg }) => {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Services', href: '#services' },
    { name: 'Gallery', href: '#gallery' },
    { name: 'Reviews', href: '#reviews' },
  ];

  return (
    <motion.nav
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        navbarBg
          ? 'bg-white/95 backdrop-blur-lg shadow-lg border-b border-gray-200'
          : 'bg-transparent'
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo - More Prominent */}
          <motion.a
            href="#"
            className="flex items-center space-x-3 group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
              navbarBg ? 'bg-zinc-900' : 'bg-white/20'
            }`}>
              <Wine size={20} className={navbarBg ? 'text-white' : 'text-white'} />
            </div>
            <div className="hidden sm:block">
              <div className={`text-xl font-serif font-bold leading-tight transition-colors ${
                navbarBg ? 'text-zinc-900' : 'text-white'
              }`}>
                Lake Salt
              </div>
              <div className={`text-xs font-medium tracking-wider ${
                navbarBg ? 'text-zinc-500' : 'text-zinc-400'
              }`}>
                BARTENDING
              </div>
            </div>
          </motion.a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {navLinks.map((link) => (
              <motion.a
                key={link.name}
                href={link.href}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-300 ${
                  navbarBg 
                    ? 'text-slate-600 hover:text-sky-900 hover:bg-sky-50' 
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                {link.name}
              </motion.a>
            ))}
            
            {/* Desktop CTA Button */}
            <motion.a
              href="#contact"
              className={`ml-4 px-6 py-2.5 font-bold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl ${
                navbarBg 
                  ? 'bg-gradient-to-r from-sky-600 to-teal-600 text-white hover:shadow-sky-200' 
                  : 'bg-white text-sky-900 hover:bg-sky-50'
              }`}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              Book Now
            </motion.a>
          </div>

          {/* Mobile Menu Button */}
          <motion.button
            className={`md:hidden p-2 rounded-lg transition-colors ${
              navbarBg ? 'text-zinc-900 hover:bg-zinc-100' : 'text-white hover:bg-white/10'
            }`}
            onClick={() => setIsOpen(!isOpen)}
            whileTap={{ scale: 0.9 }}
          >
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </motion.button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden overflow-hidden"
            >
              <div className="px-2 pt-2 pb-6 space-y-2 bg-zinc-900/95 backdrop-blur-md rounded-lg mt-2 border border-zinc-800">
                {navLinks.map((link, idx) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    className="block px-4 py-3 text-base font-medium text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    onClick={() => setIsOpen(false)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {link.name}
                  </motion.a>
                ))}
                <motion.a
                  href="#contact"
                  className="block px-4 py-3 bg-white text-zinc-900 font-bold rounded-lg text-center mt-4 hover:bg-zinc-100"
                  onClick={() => setIsOpen(false)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: navLinks.length * 0.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Book Now
                </motion.a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
};

export default Navbar;

