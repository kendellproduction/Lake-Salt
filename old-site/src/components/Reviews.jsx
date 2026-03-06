import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';
import { useState, useEffect } from 'react';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Star, ExternalLink } from 'lucide-react';

const Reviews = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        // Try to fetch from API first
        const response = await fetch('http://localhost:5001/api/reviews');
        if (response.ok) {
          const reviewsData = await response.json();
          setReviews(reviewsData);
        } else {
          throw new Error('API not available');
        }
      } catch (error) {
        console.warn('API not available, loading from static file:', error.message);
        // Fallback to static reviews.json file
        try {
          const fallbackResponse = await fetch('/reviews.json');
          if (fallbackResponse.ok) {
            const reviewsData = await fallbackResponse.json();
            setReviews(reviewsData);
          } else {
            console.error('Failed to load static reviews file');
            setReviews([]);
          }
        } catch (fallbackError) {
          console.error('Error loading reviews:', fallbackError);
          setReviews([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, []);

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
    <section id="reviews" className="py-20 bg-gradient-to-b from-slate-900 to-slate-800" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">
            What Our Clients Say
          </h2>
          <p className="text-lg text-slate-300 mb-4">
            {loading ? 'Loading reviews...' : reviews.length > 0 ? `${reviews.length} Verified Review${reviews.length !== 1 ? 's' : ''}` : 'Real Reviews Coming Soon'}
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

        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-center py-16"
          >
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading reviews...</p>
            </div>
          </motion.div>
        ) : reviews.length > 0 ? (
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
                <SwiperSlide key={review.id || idx}>
                  <motion.a
                    href="https://www.google.com/search?q=lake+salt+bartending+utah+reviews"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full cursor-pointer"
                    whileHover={{ translateY: -4, scale: 1.02 }}
                  >
                    <div
                      className="bg-gradient-to-br from-blue-50 to-sky-50 p-6 rounded-xl shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/40 transition-all duration-300 border-2 border-sky-300 h-full min-h-80 flex flex-col group"
                    >
                      {/* Stars */}
                      <div className="flex gap-1 mb-4">
                        {Array(review.rating || 5)
                          .fill(0)
                          .map((_, i) => (
                            <Star
                              key={i}
                              size={18}
                              className="fill-sky-500 text-sky-500 group-hover:fill-sky-400 group-hover:text-sky-400 transition-colors"
                            />
                          ))}
                      </div>

                      {/* Quote */}
                      <p className="text-slate-700 mb-6 flex-grow leading-relaxed font-light italic group-hover:text-slate-900 transition-colors">
                        "{review.quote}"
                      </p>

                      {/* Author */}
                      <div className="border-t border-sky-50 pt-4">
                        <p className="font-semibold text-slate-900">{review.name}</p>
                        <p className="text-sm text-slate-500">{review.title}</p>
                      </div>

                      {/* Hint for interaction */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-sky-400">
                        <ExternalLink size={16} />
                      </div>
                    </div>
                  </motion.a>
                </SwiperSlide>
              ))}
            </Swiper>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center py-16"
          >
            <div className="bg-white p-8 rounded-xl shadow-md shadow-sky-100/50 border border-sky-50 max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Real Reviews Coming Soon</h3>
              <p className="text-slate-600 mb-6">
                We're collecting authentic reviews from our satisfied clients. Check back soon to see what people are saying about Lake Salt Bartending!
              </p>
              <motion.a
                href="https://www.google.com/search?q=lake+salt+bartending+utah+reviews"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sky-600 font-semibold hover:text-sky-700 transition-colors"
                whileHover={{ scale: 1.05 }}
              >
                View Our Google Reviews
                <ExternalLink size={18} />
              </motion.a>
            </div>
          </motion.div>
        )}

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

