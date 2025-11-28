import { useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import emailjs from '@emailjs/browser';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';

// Initialize EmailJS
const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'YOUR_SERVICE_ID';
const templateId =
  import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'YOUR_TEMPLATE_ID';

// Initialize EmailJS when a real public key is present
if (publicKey && publicKey !== 'YOUR_PUBLIC_KEY') {
  emailjs.init({ publicKey });
}

const Contact = () => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    eventDate: '',
    eventType: '',
    guestCount: '',
    message: '',
  });

  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const eventTypes = [
    'Wedding',
    'Corporate Event',
    'Private Gathering',
    'Birthday Party',
    'Anniversary',
    'Other',
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');

    try {
      // Validate required fields
      if (
        !formData.name ||
        !formData.email ||
        !formData.eventDate ||
        !formData.eventType
      ) {
        throw new Error('Please fill in all required fields');
      }

      // Send email via EmailJS
      await emailjs.send(
        serviceId,
        templateId,
        {
          to_email: 'contact@lakesalt.us',
          from_name: formData.name,
          from_email: formData.email,
          event_date: formData.eventDate,
          event_type: formData.eventType,
          guest_count: formData.guestCount || 'Not specified',
          message: formData.message || 'No additional message',
        },
        publicKey
      );

      setStatus('success');
      setMessage('Your booking request has been sent successfully!');
      setFormData({
        name: '',
        email: '',
        eventDate: '',
        eventType: '',
        guestCount: '',
        message: '',
      });

      // Reset after 5 seconds
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 5000);
    } catch (err) {
      setStatus('error');
      setMessage(
        err.message || 'Failed to send booking request. Please try again.'
      );
      console.error('EmailJS Error:', err?.text || err);

      // Reset after 5 seconds
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 5000);
    }
  };

  return (
    <section id="contact" className="py-20 bg-gradient-to-b from-slate-900 to-slate-950 text-white" ref={ref}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Book Your Event
          </h2>
          <p className="text-lg text-slate-400">
            Ready to elevate your event? Fill out the form below and we'll create something unforgettable together.
          </p>
        </motion.div>

        <motion.div
          className="bg-white p-8 md:p-12 rounded-2xl shadow-2xl shadow-sky-900/20 border border-sky-100/10"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          {/* Status Messages */}
          {status === 'success' && (
            <motion.div
              className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg flex items-start gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <CheckCircle className="flex-shrink-0 mt-0.5 text-green-600" />
              <p className="text-green-700">{message}</p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg flex items-start gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlertCircle className="flex-shrink-0 mt-0.5 text-red-600" />
              <p className="text-red-700">{message}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name & Email Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5 }}
              >
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                  placeholder="Your name"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5 }}
              >
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                  placeholder="your@email.com"
                />
              </motion.div>
            </div>

            {/* Event Date & Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Event Date *
                </label>
                <input
                  type="date"
                  name="eventDate"
                  value={formData.eventDate}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Event Type *
                </label>
                <select
                  name="eventType"
                  value={formData.eventType}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                >
                  <option value="">Select an event type</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type} className="bg-white">
                      {type}
                    </option>
                  ))}
                </select>
              </motion.div>
            </div>

            {/* Guest Count */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Guest Count (approximate)
              </label>
              <input
                type="number"
                name="guestCount"
                value={formData.guestCount}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
                placeholder="50"
              />
            </motion.div>

            {/* Message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Message
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows={5}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all resize-none"
                placeholder="Tell us about your event, specific drink requests, or any special details..."
              />
            </motion.div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={status === 'loading'}
              className="w-full px-8 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white font-semibold rounded-lg hover:from-sky-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:shadow-sky-200"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {status === 'loading' ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Send size={20} />
                  </motion.div>
                  Sending...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Send Booking Request
                </>
              )}
            </motion.button>
          </form>
        </motion.div>

        {/* Alternative Contact Methods */}
        <motion.div
          className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="text-center p-6 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-sky-500/50 transition-colors backdrop-blur-sm">
            <p className="text-white font-semibold mb-2">Email</p>
            <a
              href="mailto:contact@lakesalt.us"
              className="text-slate-400 hover:text-white transition-colors font-medium"
            >
              contact@lakesalt.us
            </a>
          </div>
          <div className="text-center p-6 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-sky-500/50 transition-colors backdrop-blur-sm">
            <p className="text-white font-semibold mb-2">Instagram</p>
            <a
              href="https://instagram.com/lakesaltbartending"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors font-medium"
            >
              @LakesaltBartending
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Contact;

