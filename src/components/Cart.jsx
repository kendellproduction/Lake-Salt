/**
 * Cart Component
 * 
 * Sliding cart sidebar with smooth animations.
 * Displays cart items, quantities, prices, and checkout button.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Plus, Minus, Trash2, ExternalLink } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { formatPrice } from '../utils/shopify';

export default function Cart() {
  const {
    isCartOpen,
    closeCart,
    getLineItems,
    getTotalPrice,
    getSubtotalPrice,
    updateItem,
    removeItem,
    cartCount,
    getCheckoutUrl,
    isLoading,
  } = useCart();

  const lineItems = getLineItems();
  const totalPrice = getTotalPrice();
  const subtotalPrice = getSubtotalPrice();

  const handleCheckout = () => {
    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
    }
  };

  const handleUpdateQuantity = (lineItemId, currentQuantity, change) => {
    const newQuantity = currentQuantity + change;
    if (newQuantity > 0) {
      updateItem(lineItemId, newQuantity);
    }
  };

  return (
    <>
      {/* Backdrop Overlay */}
      <AnimatePresence>
        {isCartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Cart Header */}
            <div className="bg-gradient-to-r from-navy to-gold p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-6 h-6" />
                  <h2 className="text-2xl font-bold">Your Cart</h2>
                  {cartCount > 0 && (
                    <span className="bg-white text-navy px-3 py-1 rounded-full text-sm font-bold">
                      {cartCount}
                    </span>
                  )}
                </div>
                <motion.button
                  onClick={closeCart}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors duration-200"
                  aria-label="Close cart"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6">
              {lineItems.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <ShoppingCart className="w-24 h-24 text-gray-300 mb-4" />
                  <h3 className="text-xl font-bold text-gray-600 mb-2">
                    Your cart is empty
                  </h3>
                  <p className="text-gray-500 mb-6">
                    Add some products to get started!
                  </p>
                  <motion.button
                    onClick={closeCart}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-gradient-to-r from-navy to-gold text-white px-6 py-3 rounded-full font-semibold"
                  >
                    Continue Shopping
                  </motion.button>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-cream/30 rounded-xl p-4 hover:bg-cream/50 transition-colors duration-300"
                    >
                      <div className="flex gap-4">
                        {/* Product Image */}
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-white flex-shrink-0">
                          {item.variant?.image ? (
                            <img
                              src={item.variant.image.src}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                              <ShoppingCart className="w-8 h-8 text-gray-300" />
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-navy mb-1 truncate">
                            {item.title}
                          </h3>
                          {item.variant?.title !== 'Default Title' && (
                            <p className="text-sm text-gray-600 mb-2">
                              {item.variant?.title}
                            </p>
                          )}
                          
                          {/* Quantity Controls */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1">
                              <motion.button
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                                disabled={isLoading}
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                className="text-navy hover:text-gold disabled:opacity-50"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-4 h-4" />
                              </motion.button>
                              
                              <span className="font-semibold text-navy min-w-[20px] text-center">
                                {item.quantity}
                              </span>
                              
                              <motion.button
                                onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                                disabled={isLoading}
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                className="text-navy hover:text-gold disabled:opacity-50"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-4 h-4" />
                              </motion.button>
                            </div>

                            {/* Price */}
                            <span className="font-bold text-gold">
                              {formatPrice(parseFloat(item.variant?.price) * item.quantity)}
                            </span>

                            {/* Remove Button */}
                            <motion.button
                              onClick={() => removeItem(item.id)}
                              disabled={isLoading}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              className="ml-auto text-red-500 hover:text-red-700 disabled:opacity-50"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {lineItems.length > 0 && (
              <div className="border-t border-gray-200 p-6 bg-white">
                {/* Subtotal */}
                <div className="flex justify-between mb-2 text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotalPrice.amount)}</span>
                </div>

                {/* Shipping Notice */}
                <p className="text-sm text-gray-500 mb-4">
                  Shipping and taxes calculated at checkout
                </p>

                {/* Total */}
                <div className="flex justify-between mb-6 text-xl font-bold text-navy">
                  <span>Total</span>
                  <span className="text-gold">{formatPrice(totalPrice.amount)}</span>
                </div>

                {/* Checkout Button */}
                <motion.button
                  onClick={handleCheckout}
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-navy to-gold text-white py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ExternalLink className="w-5 h-5" />
                </motion.button>

                {/* Continue Shopping */}
                <motion.button
                  onClick={closeCart}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full mt-3 bg-white border-2 border-navy text-navy py-3 rounded-full font-semibold hover:bg-cream transition-colors duration-300"
                >
                  Continue Shopping
                </motion.button>

                {/* Security Badge */}
                <p className="text-xs text-center text-gray-500 mt-4">
                  🔒 Secure checkout powered by Shopify
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

