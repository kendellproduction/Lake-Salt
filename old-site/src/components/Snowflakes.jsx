import { motion } from 'framer-motion';

const Snowflakes = () => {
  const snowflakes = Array.from({ length: 10 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 10 + Math.random() * 10,
    size: 10 + Math.random() * 20,
  }));

  return (
    <>
      {snowflakes.map((snowflake) => (
        <motion.div
          key={snowflake.id}
          className="fixed pointer-events-none text-white/40"
          style={{
            left: `${snowflake.left}%`,
            top: '-30px',
            fontSize: `${snowflake.size}px`,
          }}
          animate={{
            y: window.innerHeight + 100,
            x: [0, 100, -100, 0],
            rotate: 360,
            opacity: [0, 1, 0.8, 0],
          }}
          transition={{
            duration: snowflake.duration,
            delay: snowflake.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          ❄️
        </motion.div>
      ))}
    </>
  );
};

export default Snowflakes;

