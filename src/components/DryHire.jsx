import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  ClipboardCheck, 
  Users, 
  Sparkles, 
  Wine, 
  CheckCircle2,
  ShoppingCart,
  FileText,
  Star
} from 'lucide-react';

const DryHire = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const weProvide = [
    {
      icon: Users,
      title: 'Professional Bartenders',
      description: 'Certified mixologists with years of experience',
    },
    {
      icon: Sparkles,
      title: 'Full Bar Setup',
      description: 'All equipment, glassware, ice, and garnishes',
    },
    {
      icon: ClipboardCheck,
      title: 'Custom Menus',
      description: 'Personalized cocktail selections for your event',
    },
    {
      icon: FileText,
      title: 'Detailed Shopping List',
      description: 'Complete list with exact quantities needed',
    },
  ];

  const howItWorks = [
    {
      step: '01',
      title: 'Consultation',
      description: 'We discuss your event, guest count, and drink preferences',
    },
    {
      step: '02',
      title: 'Custom Menu',
      description: 'We create a tailored cocktail menu for your occasion',
    },
    {
      step: '03',
      title: 'Shopping List',
      description: 'You receive a detailed list of alcohol to purchase',
    },
    {
      step: '04',
      title: 'We Bring the Magic',
      description: 'Our team arrives with everything else and serves your guests',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.6, -0.05, 0.01, 0.99] },
    },
  };

  return (
    <section className="relative py-20 bg-slate-50 overflow-hidden" ref={ref}>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 text-slate-900">
            We Bring <span className="text-sky-500 italic">Everything</span> But the Alcohol
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
            Our dry hire service means you purchase the alcohol, and we handle absolutely everything else—from setup to service.
          </p>
        </motion.div>

        {/* Split Layout */}
        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          {/* What We Provide */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle2 className="text-teal-500" size={28} strokeWidth={2.5} />
                <h3 className="text-3xl font-serif font-bold text-slate-900">
                  What We Provide
                </h3>
              </div>
              <div className="h-0.5 w-16 bg-sky-200 rounded-full"></div>
            </div>

            <div className="space-y-4">
              {weProvide.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={idx}
                    className="group flex gap-4 p-5 bg-white rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100/50 transition-all duration-300"
                    initial={{ opacity: 0, x: -30 }}
                    animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
                    transition={{ duration: 0.6, delay: 0.3 + idx * 0.1 }}
                    whileHover={{ x: 4 }}
                  >
                    <div className="flex-shrink-0">
                      <div className="bg-gradient-to-br from-sky-500 to-teal-600 p-3 rounded-lg group-hover:scale-105 transition-transform duration-300 shadow-md shadow-sky-200/50">
                        <Icon size={24} className="text-white" strokeWidth={2} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-sky-700 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-slate-600 text-sm leading-relaxed font-light">
                        {item.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* How It Works */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <Wine className="text-teal-500" size={28} strokeWidth={2.5} />
                <h3 className="text-3xl font-serif font-bold text-slate-900">
                  How It Works
                </h3>
              </div>
              <div className="h-0.5 w-16 bg-sky-200 rounded-full"></div>
            </div>

            <div className="space-y-4">
              {howItWorks.map((item, idx) => (
                <motion.div
                  key={idx}
                  className="relative group"
                  initial={{ opacity: 0, y: 30 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                  transition={{ duration: 0.6, delay: 0.5 + idx * 0.1 }}
                >
                  {/* Connector Line */}
                  {idx < howItWorks.length - 1 && (
                    <div className="absolute left-8 top-[88px] w-0.5 h-4 bg-sky-100"></div>
                  )}

                  <div className="flex gap-4 p-5 bg-white rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100/50 transition-all duration-300 group-hover:-translate-y-1">
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-slate-900 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-md border border-slate-800 group-hover:border-sky-500/50">
                        <span className="text-2xl font-bold text-white group-hover:text-sky-200 transition-colors">{item.step}</span>
                      </div>
                    </div>

                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-sky-700 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-slate-600 text-sm leading-relaxed font-light">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Call to Action Box */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, delay: 0.9 }}
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