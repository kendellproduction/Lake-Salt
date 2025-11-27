import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import {
  Users,
  Sparkles,
  Briefcase,
  MapPin,
  Star,
  Award,
} from 'lucide-react';

const WhatSetsUsApart = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const features = [
    {
      icon: Users,
      title: 'Professional Bartenders',
      description:
        'Certified, experienced mixologists trained in both classic and modern cocktail techniques.',
    },
    {
      icon: Sparkles,
      title: 'Custom Cocktail Menus',
      description:
        'Personalized drink selections tailored to your event theme, season, and guest preferences.',
    },
    {
      icon: Briefcase,
      title: 'Corporate & Wedding Specialists',
      description:
        'Proven track record with Fortune 500 companies and unforgettable wedding celebrations.',
    },
    {
      icon: MapPin,
      title: 'Locally Owned in Utah',
      description:
        'Proudly serving Salt Lake City, Park City, Provo, Ogden, and throughout Northern Utah.',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.6, -0.05, 0.01, 0.99] },
    },
  };

  return (
    <section className="relative py-20 bg-white overflow-hidden" ref={ref}>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header - Elegant */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 text-slate-900">
            What Sets Us <span className="text-sky-500 italic">Apart</span>
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
            Lake Salt combines professionalism, creativity, and Utah pride to deliver exceptional bartending experiences.
          </p>
        </motion.div>

        {/* Feature Cards - Simple & Beautiful Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={idx}
                variants={cardVariants}
                className="group relative"
              >
                <motion.div
                  className="relative p-8 rounded-xl border border-sky-100 hover:border-sky-300 shadow-sm hover:shadow-lg hover:shadow-sky-100/50 transition-all duration-300 bg-white"
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {/* Icon Container */}
                  <motion.div
                    className="mb-6 relative inline-block"
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="bg-gradient-to-br from-sky-500 to-teal-600 p-4 rounded-xl shadow-lg shadow-sky-200/50">
                      <Icon size={24} className="text-white" strokeWidth={2} />
                    </div>
                  </motion.div>

                  {/* Content */}
                  <h3 className="text-xl font-bold mb-3 text-slate-900 group-hover:text-sky-700 transition-colors duration-300">
                    {feature.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed font-light">
                    {feature.description}
                  </p>

                  {/* Simple accent line */}
                  <div className="mt-6 h-0.5 w-12 bg-sky-200 rounded-full group-hover:w-16 transition-all duration-300"></div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>

      </div>
    </section>
  );
};

export default WhatSetsUsApart;