/**
 * CartContext - Global Shopping Cart State Management
 * 
 * Provides cart state and actions throughout the app using React Context.
 * Persists cart data to localStorage for session persistence.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import {
  createCheckout,
  addToCheckout,
  updateCheckoutItem,
  removeFromCheckout,
  fetchCheckout,
} from '../utils/shopify';

const CartContext = createContext();

// Custom hook to use cart context
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [checkout, setCheckout] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  // Initialize checkout on mount
  useEffect(() => {
    initializeCheckout();
  }, []);

  // Update cart count whenever checkout changes
  useEffect(() => {
    if (checkout?.lineItems) {
      const count = checkout.lineItems.reduce((total, item) => total + item.quantity, 0);
      setCartCount(count);
    } else {
      setCartCount(0);
    }
  }, [checkout]);

  /**
   * Initialize or restore checkout from localStorage
   */
  const initializeCheckout = async () => {
    try {
      // Check if there's an existing checkout ID in localStorage
      const checkoutId = localStorage.getItem('shopify_checkout_id');
      
      if (checkoutId) {
        // Try to fetch existing checkout
        const existingCheckout = await fetchCheckout(checkoutId);
        
        // Check if checkout is still valid (not completed)
        if (existingCheckout && !existingCheckout.completedAt) {
          setCheckout(existingCheckout);
          return;
        }
      }
      
      // Create new checkout if none exists or previous one was completed
      const newCheckout = await createCheckout();
      if (newCheckout) {
        setCheckout(newCheckout);
        localStorage.setItem('shopify_checkout_id', newCheckout.id);
      }
    } catch (error) {
      console.error('Error initializing checkout:', error);
    }
  };

  /**
   * Add item to cart
   * @param {string} variantId - Shopify variant ID
   * @param {number} quantity - Quantity to add
   */
  const addItem = async (variantId, quantity = 1) => {
    if (!checkout) {
      console.error('Checkout not initialized');
      return;
    }

    setIsLoading(true);
    try {
      const lineItemsToAdd = [
        {
          variantId,
          quantity: parseInt(quantity),
        },
      ];

      const updatedCheckout = await addToCheckout(checkout.id, lineItemsToAdd);
      if (updatedCheckout) {
        setCheckout(updatedCheckout);
        setIsCartOpen(true); // Open cart when item is added
      }
    } catch (error) {
      console.error('Error adding item to cart:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update item quantity in cart
   * @param {string} lineItemId - Line item ID
   * @param {number} quantity - New quantity
   */
  const updateItem = async (lineItemId, quantity) => {
    if (!checkout) return;

    setIsLoading(true);
    try {
      const lineItemsToUpdate = [
        {
          id: lineItemId,
          quantity: parseInt(quantity),
        },
      ];

      const updatedCheckout = await updateCheckoutItem(checkout.id, lineItemsToUpdate);
      if (updatedCheckout) {
        setCheckout(updatedCheckout);
      }
    } catch (error) {
      console.error('Error updating item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Remove item from cart
   * @param {string} lineItemId - Line item ID to remove
   */
  const removeItem = async (lineItemId) => {
    if (!checkout) return;

    setIsLoading(true);
    try {
      const updatedCheckout = await removeFromCheckout(checkout.id, [lineItemId]);
      if (updatedCheckout) {
        setCheckout(updatedCheckout);
      }
    } catch (error) {
      console.error('Error removing item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clear entire cart
   */
  const clearCart = async () => {
    setIsLoading(true);
    try {
      // Create a new checkout to effectively clear the cart
      const newCheckout = await createCheckout();
      if (newCheckout) {
        setCheckout(newCheckout);
        localStorage.setItem('shopify_checkout_id', newCheckout.id);
      }
    } catch (error) {
      console.error('Error clearing cart:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Toggle cart sidebar
   */
  const toggleCart = () => {
    setIsCartOpen(!isCartOpen);
  };

  /**
   * Open cart sidebar
   */
  const openCart = () => {
    setIsCartOpen(true);
  };

  /**
   * Close cart sidebar
   */
  const closeCart = () => {
    setIsCartOpen(false);
  };

  /**
   * Get checkout URL for Shopify hosted checkout
   */
  const getCheckoutUrl = () => {
    return checkout?.webUrl || '';
  };

  /**
   * Get total price
   */
  const getTotalPrice = () => {
    return checkout?.totalPrice || { amount: '0', currencyCode: 'USD' };
  };

  /**
   * Get subtotal price
   */
  const getSubtotalPrice = () => {
    return checkout?.subtotalPrice || { amount: '0', currencyCode: 'USD' };
  };

  /**
   * Get line items
   */
  const getLineItems = () => {
    return checkout?.lineItems || [];
  };

  const value = {
    checkout,
    isCartOpen,
    isLoading,
    cartCount,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    toggleCart,
    openCart,
    closeCart,
    getCheckoutUrl,
    getTotalPrice,
    getSubtotalPrice,
    getLineItems,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartContext;

