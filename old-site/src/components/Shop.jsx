/**
 * Shop Component
 * 
 * Main shopping section displaying all products in a responsive grid.
 * Features loading states, error handling, and smooth animations.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, AlertCircle, Loader2 } from 'lucide-react';
import ProductCard from './ProductCard';
import { fetchProducts, isShopifyConfigured } from '../utils/shopify';
import { mockProducts } from '../utils/mockProducts';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if Shopify is configured
      if (!isShopifyConfigured()) {
        // Use mock products for preview
        console.log('Using mock products for preview');
        setProducts(mockProducts);
        setIsLoading(false);
        return;
      }

      const fetchedProducts = await fetchProducts();
      
      if (fetchedProducts && fetchedProducts.length > 0) {
        setProducts(fetchedProducts);
      } else {
        // Fallback to mock products if no real products
        setProducts(mockProducts);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      // Fallback to mock products on error
      setProducts(mockProducts);
    } finally {
      setIsLoading(false);
    }
  };

  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <section id="shop" className="py-20 bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="inline-block mb-4"
          >
            <ShoppingBag className="w-16 h-16 text-gold mx-auto" />
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Shop Our Products
          </h2>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
            Premium cocktail garnishes, bar tools, and merchandise
          </p>
        </motion.div>

        {/* Loading State */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="w-16 h-16 text-gold" />
            </motion.div>
            <p className="mt-4 text-gray-300 text-lg">Loading amazing products...</p>
          </motion.div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-red-700 mb-2">Oops!</h3>
              <p className="text-red-600 mb-6">{error}</p>
              <motion.button
                onClick={loadProducts}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-semibold transition-colors duration-300"
              >
                Try Again
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Products Grid */}
        {!isLoading && !error && products.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6"
          >
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </motion.div>
        )}

        {/* Empty State (No Products but No Error) */}
        {!isLoading && !error && products.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <ShoppingBag className="w-24 h-24 text-gray-500 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-gray-300 mb-2">
              No Products Yet
            </h3>
            <p className="text-gray-400">
              We're stocking up! Check back soon for amazing products.
            </p>
          </motion.div>
        )}

        {/* Call to Action - Custom Orders */}
        {!isLoading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-20 text-center"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-8 md:p-12 text-white shadow-2xl border border-blue-400/20">
              <h3 className="text-2xl md:text-3xl font-bold mb-3">
                Looking for Something Custom?
              </h3>
              <p className="text-base md:text-lg mb-6 opacity-90">
                We can create custom cocktail kits and packages for your special events!
              </p>
              <motion.a
                href="#contact"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block bg-white text-blue-600 px-6 py-3 rounded-lg font-bold text-base hover:bg-gray-100 transition-colors duration-300 shadow-lg"
              >
                Contact Us for Custom Orders
              </motion.a>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

