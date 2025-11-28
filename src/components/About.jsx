import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

const About = () => {
  const { ref: whoWeAreRef, inView: whoWeAreInView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const { ref: whatWeDoRef, inView: whatWeDoInView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  };

  const fadeInLeft = {
    hidden: { opacity: 0, x: -30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  };

  const fadeInRight = {
    hidden: { opacity: 0, x: 30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  };

  return (
    <section id="about" className="py-20 bg-white">
      {/* Who We Are Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-32" ref={whoWeAreRef}>
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          initial="hidden"
          animate={whoWeAreInView ? 'visible' : 'hidden'}
        >
          {/* Text Side - Left */}
          <motion.div variants={fadeInLeft} className="space-y-6 order-2 lg:order-1">
            <div className="inline-block">
              <span className="text-sky-600 font-semibold text-sm uppercase tracking-wider">Our Story</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900">
              Who We Are
            </h2>
            <div className="space-y-4 text-lg text-slate-600 leading-relaxed">
              <p>
                Lake Salt is run by <span className="font-semibold text-slate-900">Kendell and Maddie</span> — a team that blends tech-driven organization with years of bartending expertise.
              </p>
              <p>
                Kendell works in the tech industry and oversees the business, planning, and logistics, while Maddie brings over three years of bartending experience across cocktail lounges, tiki bars, sports bars, and high-end venues. Her versatility, creativity, and professionalism shape every event.
              </p>
              <p>
                Together with our amazing group of skilled, friendly bartenders, we create seamless, tailored experiences for each crowd — from intimate gatherings to large corporate events like Adobe's Lehi campus celebrations.
              </p>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-3 gap-4 pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-sky-600">10+</div>
                <div className="text-sm text-slate-500 mt-1">Events in 4 Months</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-sky-600">3+</div>
                <div className="text-sm text-slate-500 mt-1">Years Experience</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-sky-600">100%</div>
                <div className="text-sm text-slate-500 mt-1">Client Satisfaction</div>
              </div>
            </div>
          </motion.div>

          {/* Image Side - Right */}
          <motion.div variants={fadeInRight} className="relative order-1 lg:order-2">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <img
                src="/photos/IMG_7768.jpeg"
                alt="Kendell and Maddie - Lake Salt Bartending Founders"
                className="w-full h-[500px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent"></div>
            </div>
            {/* Floating Badge */}
            <motion.div
              className="absolute -bottom-6 -left-6 bg-white px-6 py-4 rounded-xl shadow-xl border border-sky-100"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="text-sm text-slate-500">Trusted by</div>
              <div className="text-xl font-bold text-slate-900">Adobe Lehi Campus</div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* What We Do Section */}
      <div className="bg-gradient-to-br from-slate-50 to-sky-50 py-20" ref={whatWeDoRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
            initial="hidden"
            animate={whatWeDoInView ? 'visible' : 'hidden'}
          >
            {/* Image Side - Left */}
            <motion.div variants={fadeInLeft} className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src="/photos/IMG_6903.jpeg"
                  alt="Lake Salt Bartending Team at Oktoberfest Event"
                  className="w-full h-[500px] object-cover"
                />
                <div className="absolute top-4 right-4 bg-sky-500 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-lg">
                  Oktoberfest 🍺
                </div>
              </div>
            </motion.div>

            {/* Text Side - Right */}
            <motion.div variants={fadeInRight} className="space-y-6">
              <div className="inline-block">
                <span className="text-sky-600 font-semibold text-sm uppercase tracking-wider">Our Services</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900">
                What We Do
              </h2>
              <div className="space-y-4 text-lg text-slate-600 leading-relaxed">
                <p>
                  Over the past few months, Lake Salt has become the go-to bar service vendor for Adobe's Lehi campus—hosting more than <span className="font-semibold text-slate-900">10 successful events</span> in just four months.
                </p>
                <p>
                  We make hosting effortless by bringing everything you need for a seamless bar experience: professional bartenders, mixers, fresh garnishes, ice, cups or glassware, tools, and a full bar setup.
                </p>
                <p>
                  From large corporate gatherings to weddings and backyard parties, our team ensures smooth service and happy guests. Whether cocktails, mocktails, or both, our goal is to take the stress off your plate so you can enjoy the celebration.
                </p>
              </div>

              {/* Service Features */}
              <div className="space-y-3 pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Professional Bartenders & Full Setup</div>
                    <div className="text-slate-600 text-sm">Experienced mixologists with all equipment, garnishes, and supplies</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Custom Cocktails & Mocktails</div>
                    <div className="text-slate-600 text-sm">Tailored drink menus for any theme or preference</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Seamless Event Coordination</div>
                    <div className="text-slate-600 text-sm">From corporate events to intimate weddings and backyard parties</div>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <div className="pt-6">
                <a
                  href="#contact"
                  className="inline-block bg-sky-600 hover:bg-sky-700 text-white font-semibold px-8 py-4 rounded-lg transition-colors shadow-lg hover:shadow-xl"
                >
                  Get a Quote for Your Event
                </a>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;

