import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  CheckCircle2,
  Sparkles,
  Wine
} from 'lucide-react';

const DryHire = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section className="relative py-20 bg-slate-50 overflow-hidden" ref={ref}>
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <Wine className="text-sky-500" size={32} />
            <Sparkles className="text-teal-500" size={24} />
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 text-slate-900">
            We Bring <span className="text-sky-500 italic">Everything</span> But the Alcohol
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
            Our dry hire service means you purchase the alcohol, and we handle absolutely everything else—professional bartenders, full bar setup, custom menus, glassware, ice, garnishes, and a detailed shopping list so you know exactly what to buy.
          </p>
        </motion.div>

        {/* Simple benefits list */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {['Professional Bartenders', 'Full Bar Setup', 'Custom Menus', 'Shopping List'].map((item, idx) => (
            <div 
              key={idx}
              className="flex items-center gap-2 justify-center text-slate-700 bg-white rounded-lg py-3 px-4 border border-sky-100 shadow-sm"
            >
              <CheckCircle2 size={18} className="text-teal-500 flex-shrink-0" />
              <span className="text-sm font-medium">{item}</span>
            </div>
          ))}
        </motion.div>

        {/* Call to Action Box */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="relative bg-gradient-to-r from-slate-900 to-slate-800 p-10 rounded-2xl shadow-xl shadow-sky-900/20 border border-white/10">
            <div className="text-center max-w-3xl mx-auto">
              <h3 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
                Ready to Book Your Event?
              </h3>
              <p className="text-lg text-slate-300 mb-8 font-light">
                Let's discuss your vision and create an unforgettable experience for your guests.
              </p>
              <motion.a
                href="#contact"
                className="inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-sky-600 to-teal-600 text-white font-bold rounded-lg hover:from-sky-500 hover:to-teal-500 transition-all shadow-lg hover:shadow-sky-500/30"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>Get Your Custom Quote</span>
                <CheckCircle2 size={20} />
              </motion.a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default DryHire;
