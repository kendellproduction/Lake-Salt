import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const Gallery = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const galleryItems = [
    { src: '/photos/IMG_2462.jpeg', title: 'Professional Bar Setup' },
    { src: '/photos/IMG_2494.jpeg', title: 'Custom Cocktails' },
    { src: '/photos/IMG_2505.jpeg', title: 'Event Service' },
    { src: '/photos/IMG_6896.jpeg', title: 'Signature Drinks' },
    { src: '/photos/IMG_6903.jpeg', title: 'Expert Mixology' },
    { src: '/photos/IMG_6913.jpeg', title: 'Party Atmosphere' },
    { src: '/photos/IMG_6915.jpeg', title: 'Mobile Bar' },
    { src: '/photos/IMG_6919.jpeg', title: 'Wedding Service' },
    { src: '/photos/IMG_6936.jpeg', title: 'Corporate Events' },
    { src: '/photos/IMG_6950.jpeg', title: 'Private Parties' },
    { src: '/photos/IMG_7750.jpeg', title: 'Quality Ingredients' },
    { src: '/photos/IMG_7768.jpeg', title: 'Craft Experience' },
    { src: '/photos/IMG_8136.jpeg', title: 'Memorable Moments' },
  ];

  return (
    <section id="gallery" className="py-20 bg-white" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          className="text-4xl md:text-5xl font-serif font-bold text-slate-900 text-center mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          Our Work
        </motion.h2>
        <motion.p
          className="text-center text-slate-600 text-lg mb-12 max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Professional bartending services bringing exceptional experiences to Utah events
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <Swiper
            modules={[Navigation, Pagination]}
            pagination={{ clickable: true }}
            navigation
            loop={true}
            className="rounded-2xl overflow-hidden shadow-2xl shadow-sky-100/50"
            style={{ height: '600px' }}
          >
            {galleryItems.map((item, idx) => (
              <SwiperSlide key={idx}>
                <div className="relative w-full h-full bg-slate-100">
                  <img
                    src={item.src}
                    alt={item.title}
                    className="w-full h-full object-contain bg-black/5"
                  />
                  {/* Overlay with text */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end pointer-events-none">
                    <div className="p-8 text-white">
                      <h3 className="text-2xl md:text-3xl font-bold mb-2">{item.title}</h3>
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </motion.div>
      </div>
    </section>
  );
};

export default Gallery;