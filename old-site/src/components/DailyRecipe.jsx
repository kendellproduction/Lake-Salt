import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import axios from 'axios';

const DailyRecipe = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDailyRecipe = async () => {
      try {
        setLoading(true);
        // Try to fetch from local API (Python server)
        // If running locally, this endpoint will be created by the Python script
        const response = await axios.get('/api/recipe-of-day', {
          timeout: 5000,
        });
        setRecipe(response.data);
      } catch (err) {
        // Fallback to default recipe if API is not available
        console.warn('Could not fetch recipe from API, using default', err);
        setRecipe({
          name: 'Signature Mojito',
          description:
            'A refreshing classic with fresh mint, lime, and a smooth rum base.',
          ingredients: [
            '2 oz light rum',
            '1 oz fresh lime juice',
            '8-10 fresh mint leaves',
            '0.75 oz simple syrup',
            '3 oz club soda',
            'Ice and mint sprig for garnish',
          ],
          instructions:
            'Muddle mint leaves with simple syrup in a glass. Add rum and lime juice. Fill with ice and top with club soda. Stir gently and garnish with a sprig of fresh mint.',
          imageUrl: '🍹',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDailyRecipe();
  }, []);

  return (
    <section id="recipes" className="py-20 bg-zinc-50" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-zinc-900 mb-4">
            Drink of the Day
          </h2>
          <p className="text-lg text-zinc-600">
            Learn a new cocktail recipe every day, inspired by Lake Salt's signature creations
          </p>
        </motion.div>

        {loading ? (
          <motion.div
            className="text-center py-12"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="text-zinc-400">Loading today's recipe...</p>
          </motion.div>
        ) : error ? (
          <motion.div
            className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p>Unable to load recipe. Please try again later.</p>
          </motion.div>
        ) : recipe ? (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Image */}
            <motion.div
              className="md:col-span-1 flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-64 h-64 bg-zinc-900 rounded-lg shadow-2xl flex items-center justify-center">
                {recipe.imageUrl && !recipe.imageUrl.includes('http') ? (
                  <span className="text-9xl grayscale opacity-80">{recipe.imageUrl}</span>
                ) : recipe.imageUrl ? (
                  <img
                    src={recipe.imageUrl}
                    alt={recipe.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-center px-4">
                    <div className="text-white/40 font-bold text-2xl">Cocktail</div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              className="md:col-span-2 space-y-6"
              initial={{ opacity: 0, x: 30 }}
              animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div>
                <h3 className="text-3xl font-serif font-bold text-zinc-900 mb-2">
                  {recipe.name}
                </h3>
                <p className="text-lg text-zinc-600">{recipe.description}</p>
              </div>

              {/* Ingredients */}
              <div>
                <h4 className="text-xl font-bold text-zinc-900 mb-4">Ingredients</h4>
                <ul className="space-y-2">
                  {recipe.ingredients &&
                    (Array.isArray(recipe.ingredients)
                      ? recipe.ingredients
                      : recipe.ingredients.split(',').map((i) => i.trim())
                    ).map((ingredient, idx) => (
                      <motion.li
                        key={idx}
                        className="flex items-start gap-3"
                        initial={{ opacity: 0, x: -20 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <span className="text-zinc-400 font-bold mt-1">•</span>
                        <span className="text-zinc-600">{ingredient}</span>
                      </motion.li>
                    ))}
                </ul>
              </div>

              {/* Instructions */}
              <div>
                <h4 className="text-xl font-bold text-zinc-900 mb-4">
                  Instructions
                </h4>
                <p className="text-zinc-600 leading-relaxed">
                  {recipe.instructions}
                </p>
              </div>

              {/* Call to Action */}
              <motion.a
                href="#contact"
                className="inline-block px-6 py-3 bg-zinc-900 text-white font-bold rounded-lg hover:bg-zinc-800 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Want This at Your Event? Book Us!
              </motion.a>
            </motion.div>
          </motion.div>
        ) : null}

        {/* Note about Python integration */}
        <motion.div
          className="mt-12 p-6 bg-zinc-100 border border-zinc-200 rounded-lg text-sm text-zinc-500"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <p className="font-semibold text-zinc-900 mb-2">Daily Recipe:</p>
          <p>
            The "Drink of the Day" is automatically updated daily by our system.
            Each day at midnight, a new recipe is selected from our collection
            and made available here. Visit us to experience these signature cocktails!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default DailyRecipe;

