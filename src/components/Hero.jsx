import { motion } from 'framer-motion';
import { Wine, Award, Sparkles, Star } from 'lucide-react';

const Hero = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.6, -0.05, 0.01, 0.99] },
    },
  };


  return (
    <section className="relative min-h-screen overflow-hidden flex items-center">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img
          src="/hero-background.jpeg"
          alt="Lake Salt Bartending"
          className="w-full h-full object-cover object-[center_75%] grayscale-[20%] contrast-125"
        />
        <div className="absolute inset-0 bg-black/60"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80"></div>
      </div>


      {/* Content Container */}
      <div className="relative z-10 w-full">
        <motion.div
          className="container mx-auto px-4 sm:px-6 lg:px-8 py-24"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="max-w-5xl mx-auto">
            {/* Decorative Top Line */}
            <motion.div 
              variants={itemVariants}
              className="flex items-center justify-center gap-4 mb-8"
            >
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-sky-300"></div>
              <Sparkles className="text-sky-200" size={20} />
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-sky-300"></div>
            </motion.div>

            {/* Company Name - Clean & Beautiful */}
            <motion.div variants={itemVariants} className="text-center mb-8">
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-serif font-bold mb-6 leading-tight tracking-tight">
                <span className="text-white block drop-shadow-2xl">Lake Salt</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-200 to-teal-200 block drop-shadow-2xl font-light italic">Bartending</span>
              </h1>

              {/* Simple accent line */}
              <div className="flex items-center justify-center gap-2 mt-8">
                <div className="h-0.5 w-12 bg-sky-500 rounded-full"></div>
                <Wine className="text-sky-200" size={24} />
                <div className="h-0.5 w-12 bg-sky-500 rounded-full"></div>
              </div>
            </motion.div>

            {/* Description */}
            <motion.p
              variants={itemVariants}
              className="text-lg md:text-xl text-slate-200 mb-12 leading-relaxed max-w-2xl mx-auto text-center font-light"
            >
              Professional mobile bartending services bringing craft cocktails and exceptional service to your Utah events.
              From weddings to corporate gatherings, we create unforgettable experiences.
            </motion.p>

            {/* CTA Buttons - Clean */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-6 justify-center items-center"
            >
              <motion.a
                href="#contact"
                className="bg-gradient-to-r from-sky-600 to-teal-600 text-white px-10 py-4 font-medium rounded-full text-lg hover:from-sky-500 hover:to-teal-500 transition-all duration-300 shadow-lg shadow-sky-900/30 hover:shadow-sky-900/50 min-w-[200px] text-center border border-white/10"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                Book Your Event
              </motion.a>

              <motion.a
                href="#services"
                className="bg-white/5 text-white px-10 py-4 font-medium rounded-full text-lg hover:bg-white/10 transition-all duration-300 border border-sky-200/30 backdrop-blur-sm min-w-[200px] text-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                View Services
              </motion.a>
            </motion.div>

            {/* Service Areas */}
            <motion.div
              variants={itemVariants}
              className="mt-16 text-center"
            >
              <div className="inline-block">
                <p className="text-sky-200/80 text-xs mb-2 uppercase tracking-[0.2em]">Serving Northern Utah</p>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-500/50 to-transparent"></div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Simple Scroll Indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <span className="text-white/70 text-xs uppercase tracking-wider font-medium">Scroll</span>
          <motion.div
            className="w-6 h-10 border-2 border-white/40 rounded-full flex items-start justify-center p-2"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.div
              className="w-1 h-2 bg-white/80 rounded-full"
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      </div>

    </section>
  );
};

export default Hero;

