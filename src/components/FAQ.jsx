import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Plus, Minus } from 'lucide-react';

const FAQ = () => {
  const { ref, inView: observerInView } = useInView({
    threshold: 0,
    triggerOnce: true,
    rootMargin: '100px 0px',
  });
  
  // Fallback: show content after mount to handle hash navigation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);
  
  const inView = observerInView || mounted;

  const [openIndex, setOpenIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('How It Works');

  const faqs = [
    // How It Works Section
    {
      question: "🎯 How do I get started?",
      category: "How It Works",
      answer:
        "Getting started is simple! Contact us through our website or email with your event details. We'll reach out to discuss your vision, preferences, and any special requests. Once we're aligned, we'll send you a custom quote and availability dates.",
    },
    {
      question: "📋 What's the booking process?",
      category: "How It Works",
      answer:
        "We keep it simple! After you reach out, we'll communicate via email or text to understand your event and preferences. We work together to finalize your custom cocktail menu, confirm all the details (venue, timing, equipment needs), and make sure everything is perfect. Once the menu and every detail is finalized, we ask for a 10% deposit to secure your date. That's it—then we show up and make magic happen!",
    },
    {
      question: "⏰ How far in advance should I book?",
      category: "How It Works",
      answer:
        "For most events, we recommend booking 2-4 weeks in advance. During peak season (holidays, summer), booking 6-8 weeks ahead is ideal to secure your preferred date and bartender. Last-minute bookings may be available depending on our schedule—contact us to inquire!",
    },
    {
      question: "📝 What happens after I book?",
      category: "How It Works",
      answer:
        "After booking, we stay in touch leading up to your event to finalize any last-minute menu changes and confirm all the details. On event day, we arrive an hour early to set up and ensure everything is perfect before your guests arrive.",
    },
    // FAQ Section
    {
      question: "Do you provide alcohol?",
      category: "FAQ",
      answer:
        "We operate as a dry hire service—you purchase the alcohol, and we handle everything else. We'll provide you with a detailed shopping list with exact quantities based on your guest count and menu. We can also recommend local suppliers and coordinate delivery if needed.",
    },
    {
      question: "Can we customize our menu?",
      category: "FAQ",
      answer:
        "Absolutely! Custom menus are our specialty. We work with you to create signature cocktails that match your event theme, guest preferences, and dietary needs. From classic cocktails to unique creations, we've got you covered.",
    },
    {
      question: "Do you offer non-alcoholic options?",
      category: "FAQ",
      answer:
        "Yes! We love crafting creative mocktails and non-alcoholic beverages. Whether you have guests who don't drink or want inclusive options for everyone, we'll create delicious alternatives that are just as special as our cocktails.",
    },
    {
      question: "How far do you travel?",
      category: "FAQ",
      answer:
        "We serve all of Northern Utah including Salt Lake City, Park City, Ogden, Lehi, Provo, and surrounding areas. For events outside our usual service area, contact us for availability and additional travel fees.",
    },
    {
      question: "What's included in your setup?",
      category: "FAQ",
      answer:
        "Our packages include a professional bar setup with all equipment, glassware, ice, bar tools, garnishes, and our expert bartenders. We also provide the shopping list for alcohol. We handle all logistics so you can focus on enjoying your event.",
    },
    {
      question: "Do you need power or water hookups?",
      category: "FAQ",
      answer:
        "We're mostly self-sufficient! We bring water and ice, but power access is helpful for blenders and lighting. We can work around limitations — just let us know your venue setup when booking.",
    },
    {
      question: "How many bartenders do you send?",
      category: "FAQ",
      answer:
        "For events under 75 guests, we typically send one bartender. For 75-150 guests, two bartenders. For larger events, we scale our team accordingly. We discuss this during your consultation.",
    },
    {
      question: "What about tips?",
      category: "FAQ",
      answer:
        "Tips are always appreciated but never expected! If you'd like to set up a tip jar, we're happy to have one. Some clients prefer to include gratuity in the final payment—whatever works best for you.",
    },
    {
      question: "Can you handle dietary restrictions?",
      category: "FAQ",
      answer:
        "Yes! Let us know about any allergies or dietary restrictions during our consultation. We can accommodate vegan, gluten-free, and other dietary needs in our cocktail and mocktail menus.",
    },
    {
      question: "What's your cancellation policy?",
      category: "FAQ",
      answer:
        "We understand plans can change. Cancellations made more than 14 days before your event receive a full refund of the deposit. For cancellations within 14 days, the deposit is non-refundable but can be applied to a future event within 6 months.",
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

  const categories = ['How It Works', 'FAQ'];
  const filteredFaqs = faqs.filter(faq => faq.category === activeCategory);

  return (
    <section id="faq" className="py-12 md:py-16 bg-zinc-950 text-zinc-300" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-white">
            How It Works & FAQ
          </h2>
          <p className="text-lg text-zinc-400">
            Everything you need to know about booking and working with Lake Salt
          </p>
        </motion.div>

        {/* Category Tabs */}
        <motion.div
          className="flex gap-4 justify-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {categories.map((category) => (
            <motion.button
              key={category}
              onClick={() => {
                setActiveCategory(category);
                setOpenIndex(0);
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                activeCategory === category
                  ? 'bg-white text-zinc-900 shadow-lg shadow-white/20'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {category}
            </motion.button>
          ))}
        </motion.div>

        <motion.div
          className="space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {filteredFaqs.map((faq, idx) => (
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
          className="mt-10 text-center"
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

