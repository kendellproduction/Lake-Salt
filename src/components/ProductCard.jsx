/**
 * ProductCard Component
 * 
 * Displays individual product with image, title, price, and add to cart button.
 * Features smooth animations and hover effects for premium UX.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { formatPrice } from '../utils/shopify';

export default function ProductCard({ product }) {
  const { addItem, isLoading } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Get the first variant (most products have at least one variant)
  const variant = product.variants?.[0];
  const image = product.images?.[0];

  if (!variant) {
    return null; // Don't render if no variant exists
  }

  const handleAddToCart = async () => {
    setIsAdding(true);
    
    try {
      await addItem(variant.id, 1);
      
      // Show success feedback
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error adding to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="group relative bg-gray-800 rounded-xl shadow-xl overflow-hidden hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 border border-gray-700"
    >
      {/* Product Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-900">
        {image ? (
          <motion.img
            src={image.src}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <ShoppingCart className="w-12 h-12 text-gray-600" />
          </div>
        )}
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
      </div>

      {/* Product Info */}
      <div className="p-4">
        {/* Product Title */}
        <h3 className="text-base font-bold text-white mb-1 line-clamp-2 group-hover:text-gold transition-colors duration-300">
          {product.title}
        </h3>

        {/* Product Description */}
        {product.description && (
          <p className="text-gray-400 text-xs mb-3 line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Price and Add to Cart */}
        <div className="flex items-center justify-between mt-3">
          {/* Price */}
          <div>
            {variant.compareAtPrice && parseFloat(variant.compareAtPrice) > parseFloat(variant.price) ? (
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 line-through">
                  {formatPrice(variant.compareAtPrice)}
                </span>
                <span className="text-xl font-bold text-gold">
                  {formatPrice(variant.price)}
                </span>
              </div>
            ) : (
              <span className="text-xl font-bold text-white">
                {formatPrice(variant.price)}
              </span>
            )}
          </div>

          {/* Add to Cart Button */}
          <motion.button
            onClick={handleAddToCart}
            disabled={isAdding || isLoading || !variant.available}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`
              relative px-4 py-2 rounded-lg font-semibold text-sm text-white
              transition-all duration-300 shadow-lg hover:shadow-xl
              disabled:opacity-50 disabled:cursor-not-allowed
              ${showSuccess 
                ? 'bg-green-500' 
                : variant.available 
                  ? 'bg-blue-600 hover:bg-blue-500' 
                  : 'bg-gray-600'
              }
            `}
          >
            <span className="flex items-center gap-2">
              {showSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Added!</span>
                </>
              ) : isAdding ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </motion.div>
                </>
              ) : !variant.available ? (
                <span>Sold Out</span>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  <span>Add to Cart</span>
                </>
              )}
            </span>
          </motion.button>
        </div>

        {/* Availability Badge */}
        {!variant.available && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-center"
          >
            <span className="inline-block bg-red-900/50 text-red-400 px-2 py-1 rounded text-xs font-medium">
              Out of Stock
            </span>
          </motion.div>
        )}
      </div>

      {/* Sale Badge */}
      {variant.compareAtPrice && parseFloat(variant.compareAtPrice) > parseFloat(variant.price) && (
        <motion.div
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: -12 }}
          className="absolute top-3 left-3 bg-red-500 text-white px-3 py-1 rounded-lg font-bold text-xs shadow-lg"
        >
          SALE
        </motion.div>
      )}
    </motion.div>
  );
}

