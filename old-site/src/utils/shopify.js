/**
 * Shopify Client Configuration
 * 
 * This file initializes the Shopify Buy SDK client for accessing
 * the Storefront API to fetch products, manage cart, and handle checkout.
 */

import Client from 'shopify-buy';

// Initialize Shopify client with environment variables
const shopifyClient = Client.buildClient({
  domain: import.meta.env.VITE_SHOPIFY_DOMAIN || '',
  storefrontAccessToken: import.meta.env.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN || '',
});

/**
 * Fetch all products from Shopify store
 * @returns {Promise<Array>} Array of product objects
 */
export const fetchProducts = async () => {
  try {
    const products = await shopifyClient.product.fetchAll();
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
};

/**
 * Fetch a single product by ID
 * @param {string} productId - Shopify product ID
 * @returns {Promise<Object>} Product object
 */
export const fetchProduct = async (productId) => {
  try {
    const product = await shopifyClient.product.fetch(productId);
    return product;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
};

/**
 * Create a new checkout (cart)
 * @returns {Promise<Object>} Checkout object
 */
export const createCheckout = async () => {
  try {
    const checkout = await shopifyClient.checkout.create();
    return checkout;
  } catch (error) {
    console.error('Error creating checkout:', error);
    return null;
  }
};

/**
 * Add line items to checkout
 * @param {string} checkoutId - Checkout ID
 * @param {Array} lineItems - Array of {variantId, quantity}
 * @returns {Promise<Object>} Updated checkout object
 */
export const addToCheckout = async (checkoutId, lineItems) => {
  try {
    const checkout = await shopifyClient.checkout.addLineItems(checkoutId, lineItems);
    return checkout;
  } catch (error) {
    console.error('Error adding to checkout:', error);
    return null;
  }
};

/**
 * Update line item quantity in checkout
 * @param {string} checkoutId - Checkout ID
 * @param {Array} lineItems - Array of {id, quantity}
 * @returns {Promise<Object>} Updated checkout object
 */
export const updateCheckoutItem = async (checkoutId, lineItems) => {
  try {
    const checkout = await shopifyClient.checkout.updateLineItems(checkoutId, lineItems);
    return checkout;
  } catch (error) {
    console.error('Error updating checkout:', error);
    return null;
  }
};

/**
 * Remove line items from checkout
 * @param {string} checkoutId - Checkout ID
 * @param {Array} lineItemIds - Array of line item IDs to remove
 * @returns {Promise<Object>} Updated checkout object
 */
export const removeFromCheckout = async (checkoutId, lineItemIds) => {
  try {
    const checkout = await shopifyClient.checkout.removeLineItems(checkoutId, lineItemIds);
    return checkout;
  } catch (error) {
    console.error('Error removing from checkout:', error);
    return null;
  }
};

/**
 * Fetch existing checkout by ID
 * @param {string} checkoutId - Checkout ID
 * @returns {Promise<Object>} Checkout object
 */
export const fetchCheckout = async (checkoutId) => {
  try {
    const checkout = await shopifyClient.checkout.fetch(checkoutId);
    return checkout;
  } catch (error) {
    console.error('Error fetching checkout:', error);
    return null;
  }
};

/**
 * Format price for display
 * @param {string|number} price - Price value
 * @param {string} currencyCode - Currency code (default: USD)
 * @returns {string} Formatted price string
 */
export const formatPrice = (price, currencyCode = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(price);
};

/**
 * Check if Shopify is configured
 * @returns {boolean} True if Shopify credentials are set
 */
export const isShopifyConfigured = () => {
  return !!(import.meta.env.VITE_SHOPIFY_DOMAIN && 
            import.meta.env.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN);
};

export default shopifyClient;

