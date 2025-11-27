import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Star, ExternalLink } from 'lucide-react';

const Reviews = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const reviews = [
    {
      name: 'Sarah Chen',
      title: 'Adobe Lehi - Event Coordinator',
      quote:
        'The Lake Salt team was incredible! Professional, fun, and their creative drinks were the hit of our Oktoberfest. They handled 200+ guests seamlessly.',
      rating: 5,
    },
    {
      name: 'Jessica & Michael',
      title: 'Wedding Couple - Park City',
      quote:
        'Lake Salt made our wedding reception unforgettable. Ken and Maddie created signature cocktails that perfectly matched our vision. Highly recommend!',
      rating: 5,
    },
    {
      name: 'Robert Johnson',
      title: 'Ogden Corporate Event',
      quote:
        'Professional, polished, and delightful to work with. The team went above and beyond to ensure every guest felt welcomed. Best bartending service in Utah!',
      rating: 5,
    },
    {
      name: 'Amanda Pierce',
      title: 'Private 40th Birthday Party',
      quote:
        'Lake Salt turned my birthday into a memory I\'ll never forget. The custom cocktails, the energy, and the professionalism were top-notch. Worth every penny!',
      rating: 5,
    },
    {
      name: 'David Martinez',
      title: 'Salt Lake Corporate Gala',
      quote:
        'We\'ve used Lake Salt for three corporate events now. Consistent excellence, attention to detail, and their bartenders are always personable and skilled.',
      rating: 5,
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  return (
    <section id="reviews" className="py-20 bg-slate-50" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 mb-4">
            What Our Clients Say
          </h2>
          <p className="text-lg text-slate-600 mb-4">
            5.0 Average Rating (11+ Verified Reviews)
          </p>
          <motion.a
            href="https://www.google.com/search?q=Lake+Salt+Bartending+Utah+reviews"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sky-600 font-semibold hover:text-sky-700 transition-colors"
            whileHover={{ scale: 1.05 }}
          >
            View on Google Reviews
            <ExternalLink size={18} />
          </motion.a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <Swiper
            modules={[Pagination, Navigation, Autoplay]}
            autoplay={{ delay: 6000, disableOnInteraction: true }}
            pagination={{ clickable: true }}
            navigation
            className="py-8"
            slidesPerView={1}
            breakpoints={{
              768: {
                slidesPerView: 2,
              },
              1024: {
                slidesPerView: 3,
              },
            }}
            spaceBetween={30}
          >
            {reviews.map((review, idx) => (
              <SwiperSlide key={idx}>
                <motion.div
                  className="bg-white p-6 rounded-xl shadow-md shadow-sky-100/50 hover:shadow-lg hover:shadow-sky-200/50 transition-all duration-300 border border-sky-50 h-full flex flex-col"
                  whileHover={{ translateY: -4, scale: 1.02 }}
                >
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {Array(review.rating)
                      .fill(0)
                      .map((_, i) => (
                        <Star
                          key={i}
                          size={18}
                          className="fill-sky-500 text-sky-500"
                        />
                      ))}
                  </div>

                  {/* Quote */}
                  <p className="text-slate-700 mb-6 flex-grow leading-relaxed font-light italic">
                    "{review.quote}"
                  </p>

                  {/* Author */}
                  <div className="border-t border-sky-50 pt-4">
                    <p className="font-semibold text-slate-900">{review.name}</p>
                    <p className="text-sm text-slate-500">{review.title}</p>
                  </div>
                </motion.div>
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <p className="text-lg text-slate-600 mb-6">
            Ready to create your own unforgettable moment?
          </p>
          <motion.a
            href="#contact"
            className="inline-block px-8 py-4 bg-gradient-to-r from-sky-600 to-teal-600 text-white font-bold rounded-lg hover:from-sky-500 hover:to-teal-500 transition-all shadow-lg shadow-sky-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Book Your Event Today
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
};

export default Reviews;

