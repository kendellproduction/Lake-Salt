import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Plus, Minus } from 'lucide-react';

const FAQ = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      question: 'Do you provide alcohol?',
      answer:
        'We primarily handle mixing and serving. You can provide your own alcohol, or we can recommend local suppliers and coordinate a delivery. We ensure all beverages meet quality standards and comply with Utah regulations.',
    },
    {
      question: 'Can we customize our menu?',
      answer:
        'Absolutely! Custom menus are our specialty. We work with you to create signature cocktails that match your event theme, guest preferences, and dietary needs. From classic cocktails to unique creations, we\'ve got you covered.',
    },
    {
      question: 'How far do you travel?',
      answer:
        'We serve all of Northern Utah including Salt Lake City, Park City, Ogden, Lehi, Provo, and surrounding areas. For events outside our usual service area, contact us for availability and additional travel fees.',
    },
    {
      question: 'What\'s included in your setup?',
      answer:
        'Our packages include a professional bar setup with all equipment, glassware, ice, bar tools, and our expert bartenders. We handle all logistics so you can focus on enjoying your event.',
    },
    {
      question: 'Do you need power or water hookups?',
      answer:
        'We\'re mostly self-sufficient! We bring water and ice, but power access is helpful for blenders and lighting. We can work around limitations — just let us know your venue setup when booking.',
    },
    {
      question: 'How many bartenders do you send?',
      answer:
        'For events under 75 guests, we typically send one bartender. For 75-150 guests, two bartenders. For larger events, we scale our team accordingly. We discuss this during your consultation.',
    },
  ];

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
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <section id="faq" className="py-20 bg-zinc-950 text-zinc-300" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-zinc-400">
            Have questions? We've got answers.
          </p>
        </motion.div>

        <motion.div
          className="space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {faqs.map((faq, idx) => (
            <motion.div
              key={idx}
              variants={itemVariants}
              className="glass-effect rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900/50"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                className="w-full p-6 flex items-center justify-between hover:bg-zinc-800/50 transition-colors text-left"
              >
                <h3 className="text-lg font-bold text-white flex-1">
                  {faq.question}
                </h3>
                <motion.div
                  animate={{ rotate: openIndex === idx ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {openIndex === idx ? (
                    <Minus className="text-zinc-400 flex-shrink-0" size={24} />
                  ) : (
                    <Plus className="text-zinc-400 flex-shrink-0" size={24} />
                  )}
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 border-t border-zinc-800 text-zinc-400 leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* Contact Prompt */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <p className="text-zinc-400 mb-6">
            Don't see your question? Reach out to us directly!
          </p>
          <motion.a
            href="#contact"
            className="inline-block px-8 py-3 bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-200 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Get in Touch
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
};

export default FAQ;

