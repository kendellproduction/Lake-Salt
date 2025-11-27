import { motion } from 'framer-motion';
import { Instagram, Mail, MapPin, Star, ExternalLink } from 'lucide-react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <footer className="bg-slate-950 text-slate-300 pt-20 pb-8 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Footer Content */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {/* About Section */}
          <motion.div variants={itemVariants}>
            <h3 className="text-2xl font-serif font-bold text-white mb-4">
              Lake Salt Bartending
            </h3>
            <p className="text-slate-400 leading-relaxed mb-4">
              Utah's premier mobile bartending service, creating unforgettable moments for weddings, corporate events, and private celebrations.
            </p>
            <div className="flex items-center gap-2 text-sky-500">
              <MapPin size={20} />
              <span>Northern Utah</span>
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div variants={itemVariants}>
            <h3 className="text-xl font-bold text-white mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {[
                { name: 'Services', href: '#services' },
                { name: 'Gallery', href: '#gallery' },
                { name: 'Reviews', href: '#reviews' },
                { name: 'Contact', href: '#contact' },
              ].map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Contact & Social */}
          <motion.div variants={itemVariants}>
            <h3 className="text-xl font-bold text-white mb-4">Connect With Us</h3>
            <div className="space-y-4">
              <a
                href="mailto:contact@lakesalt.us"
                className="flex items-center gap-2 text-slate-400 hover:text-sky-300 transition-colors group"
              >
                <Mail size={20} className="group-hover:scale-110 transition-transform text-sky-500" />
                <span>contact@lakesalt.us</span>
              </a>
              <a
                href="https://instagram.com/lakesaltbartending"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-400 hover:text-sky-300 transition-colors group"
              >
                <Instagram
                  size={20}
                  className="group-hover:scale-110 transition-transform text-sky-500"
                />
                <span>@LakesaltBartending</span>
              </a>
              <a
                href="https://www.google.com/search?q=Lake+Salt+Bartending+Utah+reviews"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-400 hover:text-sky-300 transition-colors group"
              >
                <Star
                  size={20}
                  className="fill-sky-500 text-sky-500 group-hover:fill-sky-300 group-hover:scale-110 transition-all"
                />
                <span>Google Reviews (5.0)</span>
              </a>
            </div>
          </motion.div>
        </motion.div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent mb-8" />

        {/* Bottom Section */}
        <motion.div
          className="flex flex-col md:flex-row items-center justify-between gap-4"
          variants={itemVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <p className="text-slate-500 text-center md:text-left">
            © {currentYear} Lake Salt Bartending — Proudly serving Utah events
          </p>
          <motion.a
            href="https://www.google.com/search?q=Lake+Salt+Bartending+Utah+reviews"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-sky-300 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            View on Google Reviews
            <ExternalLink size={16} />
          </motion.a>
        </motion.div>

        {/* Bottom Note */}
        <motion.p
          className="text-center text-xs text-slate-700 mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          Built by Lake Salt Bartending | React + Vite + Tailwind CSS
        </motion.p>
      </div>
    </footer>
  );
};

export default Footer;

