import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

const About = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8 },
    },
  };

  return (
    <section id="about" className="py-20 bg-slate-50" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {/* Image Side */}
          <motion.div variants={itemVariants} className="relative">
            <div className="bg-white rounded-2xl overflow-hidden shadow-xl shadow-sky-100/50 border border-sky-100">
              <div className="w-full h-96 flex items-center justify-center text-6xl grayscale opacity-80 bg-gradient-to-br from-slate-50 to-sky-50">
                🍸
              </div>
            </div>
            <motion.div
              className="absolute -bottom-4 -right-4 bg-white text-slate-900 p-4 rounded-xl shadow-lg font-semibold text-sm max-w-xs border border-sky-100"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Professional Mobile Bartending Throughout Utah
            </motion.div>
          </motion.div>

          {/* Text Side */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900">
              About Lake Salt Bartending
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed font-light">
              Lake Salt Bartending brings professional, high-quality mobile bartending services to Utah. Founded by experienced mixologists Ken and Maddie, we specialize in creating memorable drinking experiences for weddings, corporate events, private parties, and special occasions throughout Northern Utah.
            </p>
            <p className="text-lg text-slate-600 leading-relaxed font-light">
              With over a decade of combined experience in the hospitality industry, we understand that exceptional bartending goes beyond mixing drinks—it's about creating an atmosphere that enhances your event and brings people together.
            </p>

            {/* Key Stats */}
            <div className="grid grid-cols-2 gap-4 my-8">
              <div className="bg-white p-4 rounded-lg border border-sky-100 shadow-sm">
                <div className="text-2xl font-bold text-sky-600">500+</div>
                <div className="text-sm text-slate-500">Events Served</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-sky-100 shadow-sm">
                <div className="text-2xl font-bold text-sky-600">10+</div>
                <div className="text-sm text-slate-500">Years Experience</div>
              </div>
            </div>

            {/* Team Profiles */}
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold text-slate-900 mb-4">Meet Our Team</h3>
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Ken Profile */}
                <div className="flex-1 bg-white p-6 rounded-xl border border-sky-100 hover:border-sky-300 transition-colors shadow-sm hover:shadow-md hover:shadow-sky-100">
                  <div className="text-4xl mb-3 grayscale">👨‍🍳</div>
                  <h4 className="font-bold text-lg text-slate-900 mb-2">Ken - Head Bartender</h4>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Master mixologist with extensive experience in craft cocktail creation. Specializes in signature drinks and custom menus tailored to your event theme.
                  </p>
                </div>
                {/* Maddie Profile */}
                <div className="flex-1 bg-white p-6 rounded-xl border border-sky-100 hover:border-sky-300 transition-colors shadow-sm hover:shadow-md hover:shadow-sky-100">
                  <div className="text-4xl mb-3 grayscale">👩‍💼</div>
                  <h4 className="font-bold text-lg text-slate-900 mb-2">Maddie - Event Coordinator</h4>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Expert event coordinator ensuring seamless service from setup to cleanup. Handles all logistics and client communication for stress-free events.
                  </p>
                </div>
              </div>
            </div>

            {/* Services Overview */}
            <div className="bg-gradient-to-br from-sky-50 to-slate-50 p-6 rounded-xl border border-sky-100 mt-8">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">What We Offer</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex items-center gap-2">
                  <span className="text-teal-500">✓</span>
                  <span>Professional mobile bar setup and service</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-500">✓</span>
                  <span>Custom cocktail menus and signature drinks</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-500">✓</span>
                  <span>Full-service event coordination</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-500">✓</span>
                  <span>Service throughout Salt Lake City, Park City, Ogden, and Northern Utah</span>
                </li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default About;

