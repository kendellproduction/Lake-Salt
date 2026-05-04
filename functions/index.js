const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

// Configuration
const CALENDAR_EMAIL = 'contact@lakesalt.us';
const AVAILABILITY_START_HOUR = 16; // 4 PM
const AVAILABILITY_END_HOUR = 20; // 8 PM (20:00)
const CALL_DURATION_MINUTES = 15;
const BOOKING_WINDOW_DAYS = 30;
const TIMEZONE = 'America/Denver'; // Adjust to your timezone

// Initialize Google Calendar API with service account
let calendar;

function initializeCalendar() {
  if (calendar) return;

  // Service account credentials from Firebase environment
  const serviceAccount = JSON.parse(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}'
  );

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  calendar = google.calendar({ version: 'v3', auth });
}

// Get available time slots
exports.getAvailableSlots = functions.https.onCall(async (data, context) => {
  try {
    initializeCalendar();

    const now = new Date();
    const endDate = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Get calendar events for the booking window
    const response = await calendar.events.list({
      calendarId: CALENDAR_EMAIL,
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const bookedSlots = response.data.items || [];
    const availableSlots = [];

    // Generate all possible 15-minute slots in the availability window
    let currentDate = new Date(now);
    currentDate.setHours(AVAILABILITY_START_HOUR, 0, 0, 0);

    while (currentDate < endDate) {
      // Skip past dates and times before 4 PM
      if (currentDate > now && currentDate.getHours() >= AVAILABILITY_START_HOUR && currentDate.getHours() < AVAILABILITY_END_HOUR) {
        // Check if this slot is available (not booked)
        const slotEnd = new Date(currentDate.getTime() + CALL_DURATION_MINUTES * 60 * 1000);
        const isBooked = bookedSlots.some(event => {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          return currentDate < eventEnd && slotEnd > eventStart;
        });

        if (!isBooked) {
          availableSlots.push({
            start: currentDate.toISOString(),
            startFormatted: currentDate.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: TIMEZONE
            }),
          });
        }
      }

      // Move to next 15-minute slot
      currentDate.setMinutes(currentDate.getMinutes() + CALL_DURATION_MINUTES);

      // Skip to next day if past availability hours
      if (currentDate.getHours() >= AVAILABILITY_END_HOUR) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(AVAILABILITY_START_HOUR, 0, 0, 0);
      }
    }

    // Return first 15 available slots
    return { success: true, slots: availableSlots.slice(0, 15) };
  } catch (error) {
    console.error('Error getting available slots:', error);
    return { success: false, error: error.message };
  }
});

// Book a call slot
exports.bookCallSlot = functions.https.onCall(async (data, context) => {
  try {
    initializeCalendar();

    const { name, email, phone, slotStart, eventType } = data;

    if (!name || !email || !slotStart) {
      throw new Error('Missing required fields: name, email, or slotStart');
    }

    const startTime = new Date(slotStart);
    const endTime = new Date(startTime.getTime() + CALL_DURATION_MINUTES * 60 * 1000);

    // Create calendar event
    const event = {
      summary: `Lake Salt Call - ${name}`,
      description: `Call with ${name} (${eventType})\nEmail: ${email}\nPhone: ${phone}`,
      start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
      attendees: [
        { email: CALENDAR_EMAIL },
        { email: email },
      ],
      transparency: 'opaque',
    };

    const createdEvent = await calendar.events.insert({
      calendarId: CALENDAR_EMAIL,
      resource: event,
      sendUpdates: 'all', // Send invite to attendees
    });

    // Save booking to Firestore
    await admin.firestore().collection('call_bookings').add({
      name,
      email,
      phone,
      eventType,
      bookedTime: startTime,
      calendarEventId: createdEvent.data.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: 'Call booked successfully!',
      eventId: createdEvent.data.id,
      meetLink: createdEvent.data.hangoutLink,
    };
  } catch (error) {
    console.error('Error booking call:', error);
    return { success: false, error: error.message };
  }
});
