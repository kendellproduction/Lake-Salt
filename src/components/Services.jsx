import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { ArrowRight, Briefcase, Heart, PartyPopper, Calendar, Sparkles } from 'lucide-react';

const Services = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const services = [
    {
      icon: Briefcase,
      title: 'Corporate Events',
      description:
        'Elevate your office parties, conferences, and team celebrations with professional bartending services. Perfect for Fortune 500 companies and growing businesses alike.',
      features: ['Team Building Events', 'Product Launches', 'Annual Galas', 'Client Appreciation'],
      color: 'from-zinc-800 to-zinc-900',
    },
    {
      icon: Heart,
      title: 'Weddings',
      description:
        'Create magical moments for your special day with signature cocktails, elegant service, and seamless coordination that lets you focus on celebrating.',
      features: ['Reception Bars', 'Cocktail Hours', 'Signature Drinks', 'Toast Service'],
      color: 'from-zinc-800 to-zinc-900',
    },
    {
      icon: PartyPopper,
      title: 'Private Celebrations',
      description:
        'Intimate gatherings with custom menus tailored to your taste. From anniversaries to milestone birthdays, we bring the craft to your celebration.',
      features: ['Birthday Parties', 'Anniversaries', 'Retirement Parties', 'Family Reunions'],
      color: 'from-zinc-800 to-zinc-900',
    },
    {
      icon: Calendar,
      title: 'Themed Experiences',
      description:
        'Immersive bar experiences tailored to your vision. Tiki nights, holiday specials, seasonal menus, and custom themed events that wow your guests.',
      features: ['Seasonal Menus', 'Holiday Parties', 'Themed Bars', 'Custom Concepts'],
      color: 'from-zinc-800 to-zinc-900',
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
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.6, -0.05, 0.01, 0.99] },
    },
  };

  return (
    <section id="services" className="relative py-20 bg-slate-50" ref={ref}>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 text-slate-900">
            Our Services
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
            Professional bartending services tailored to your event. From intimate gatherings to large celebrations, we bring expertise and elegance to every occasion.
          </p>
        </motion.div>

        {/* Service Cards Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {services.map((service, idx) => {
            const Icon = service.icon;

            return (
              <motion.div
                key={idx}
                variants={cardVariants}
                className="group"
              >
                <motion.div
                  className="p-8 rounded-2xl border border-sky-100 hover:border-sky-300 hover:shadow-xl hover:shadow-sky-100/50 transition-all duration-300 h-full flex flex-col bg-white relative overflow-hidden"
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  {/* Subtle Gradient Background on Hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-sky-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <div className="relative z-10 flex flex-col h-full">
                    {/* Icon */}
                    <motion.div
                      className="mb-6 relative inline-block"
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="bg-gradient-to-br from-sky-500 to-teal-600 p-4 rounded-xl shadow-lg shadow-sky-200/50">
                        <Icon size={24} className="text-white" strokeWidth={1.5} />
                      </div>
                    </motion.div>

                    {/* Title */}
                    <h3 className="text-xl font-bold mb-4 text-slate-900 font-serif group-hover:text-sky-700 transition-colors">
                      {service.title}
                    </h3>

                    {/* Description */}
                    <p className="text-slate-600 mb-8 leading-relaxed flex-grow font-light">
                      {service.description}
                    </p>

                    {/* Features List */}
                    <div className="mb-8">
                      <div className="grid grid-cols-1 gap-3">
                        {service.features.slice(0, 3).map((feature, featureIdx) => (
                          <div key={featureIdx} className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 bg-sky-400 rounded-full"></div>
                            <span className="text-slate-500 text-sm tracking-wide">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA Button */}
                    <motion.a
                      href="#contact"
                      className="bg-slate-50 text-slate-900 px-6 py-3 rounded-lg font-medium hover:bg-sky-50 transition-all flex items-center justify-center gap-2 group-hover:bg-gradient-to-r group-hover:from-sky-600 group-hover:to-teal-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-sky-200"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>Learn More</span>
                      <ArrowRight size={16} />
                    </motion.a>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default Services;
