/**
 * Event Day Module - Lake Salt Admin Dashboard
 * Shows today's events with full details: bartender assignments, venue, menu, client info, times
 * Real-time updates via Firebase Firestore
 */

async function renderEventDay() {
  const app = document.getElementById('module-container');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  // Format today's date for display
  const todayFormatted = fmtDate(today);
  const todayISO = today.toISOString().split('T')[0];

  // Create shell HTML
  app.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Event Day</div>
        <div class="page-subtitle">${todayFormatted}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value" id="stat-today">0</div>
        <div class="stat-label">Today's Events</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-week">0</div>
        <div class="stat-label">This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-revenue">${fmtMoney(0)}</div>
        <div class="stat-label">Revenue</div>
      </div>
    </div>

    <div id="today-section" style="margin-top:16px">
      <h2 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:12px;">Today's Events</h2>
      <div id="today-events-container"></div>
    </div>

    <div id="upcoming-section" style="display:none;margin-top:24px;">
      <h2 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:12px;">Upcoming This Week</h2>
      <div id="upcoming-events-container"></div>
    </div>
  `;

  const todayContainer = document.getElementById('today-events-container');
  const upcomingContainer = document.getElementById('upcoming-events-container');
  const upcomingSection = document.getElementById('upcoming-section');

  let allEvents = [];
  let bartendersCache = {};

  /**
   * Fetch all bartenders and cache them for quick lookup
   */
  async function loadBartendersCache() {
    try {
      const snapshot = await db.collection('bartenders').get();
      bartendersCache = {};
      snapshot.forEach((doc) => {
        bartendersCache[doc.id] = doc.data();
      });
    } catch (error) {
      console.error('Error loading bartenders:', error);
    }
  }

  /**
   * Format time string "HH:MM" to readable format
   */
  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Encode address for Google Maps URL
   */
  function encodeMapAddress(address) {
    return encodeURIComponent(address);
  }

  /**
   * Render a single event card
   */
  function renderEventCard(event) {
    const mapsUrl = `https://maps.google.com/?q=${encodeMapAddress(event.venueAddress || '')}`;
    const bartendersList = (event.bartenderIds || [])
      .map((id) => bartendersCache[id])
      .filter((b) => b);

    const drinkMenuBadges = (event.drinkMenu || [])
      .map((drink) => `<span class="badge" style="background: var(--navy-lt); color: #e2e8f0; margin-right: 0.5rem; margin-bottom: 0.5rem;">${drink}</span>`)
      .join('');

    const statusColor =
      event.status === 'Completed'
        ? 'var(--green)'
        : event.status === 'Cancelled'
          ? 'var(--red)'
          : 'var(--teal)';

    const bartendersHtml = bartendersList
      .map(
        (b) => `
      <div style="padding: 0.75rem; background: var(--navy-lt); border-radius: 0.5rem; margin-bottom: 0.5rem;">
        <div style="font-weight: 600; color: #e2e8f0;">${b.name}</div>
        <div style="font-size: 0.875rem; color: var(--text-muted);">
          <a href="tel:${b.phone}" style="color: var(--teal); text-decoration: none;">${b.phone}</a>
        </div>
      </div>
    `
      )
      .join('');

    return `
      <div class="card" style="margin-bottom: 1.5rem; overflow: hidden;">
        <!-- Event Header -->
        <div class="card-header" style="background: var(--navy); padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
            <div>
              <h3 class="card-title" style="color: white; margin-bottom: 0.25rem;">${event.name}</h3>
              <span class="badge" style="background: var(--gold); color: #0D1B2A; font-size: 0.75rem;">${event.eventType}</span>
            </div>
            <span class="badge" style="background: ${statusColor}; color: white; font-size: 0.75rem;">${event.status}</span>
          </div>
        </div>

        <!-- Event Body -->
        <div style="padding: 1rem;">
          <!-- Time -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">TIME</div>
            <div style="font-size: 1rem; color: #e2e8f0; font-weight: 600;">
              ${formatTime(event.startTime)} – ${formatTime(event.endTime)}
            </div>
          </div>

          <!-- Venue -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">VENUE</div>
            <div style="font-size: 1rem; color: #e2e8f0; font-weight: 600; margin-bottom: 0.25rem;">${event.venue}</div>
            <a href="${mapsUrl}" target="_blank" style="color: var(--teal); text-decoration: none; font-size: 0.875rem; display: inline-block; padding: 0.5rem; margin: -0.5rem;">
              ${event.venueAddress || 'View on Maps'}
            </a>
          </div>

          <!-- Guest Count -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">GUESTS</div>
            <div style="font-size: 1rem; color: #e2e8f0; font-weight: 600;">${event.guestCount || 0}</div>
          </div>

          <!-- Client Info -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem;">CLIENT</div>
            <div style="font-size: 1rem; color: #e2e8f0; font-weight: 600; margin-bottom: 0.25rem;">${event.clientName}</div>
            <div style="display: flex; gap: 1rem; font-size: 0.875rem;">
              <a href="tel:${event.clientPhone}" style="color: var(--teal); text-decoration: none; padding: 0.5rem; margin: -0.5rem;">
                ${event.clientPhone}
              </a>
              <a href="mailto:${event.clientEmail}" style="color: var(--teal); text-decoration: none; padding: 0.5rem; margin: -0.5rem;">
                ${event.clientEmail}
              </a>
            </div>
          </div>

          <!-- Drink Menu -->
          ${event.drinkMenu && event.drinkMenu.length > 0 ? `
            <div style="margin-bottom: 1rem;">
              <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem;">DRINK MENU</div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${drinkMenuBadges}
              </div>
            </div>
          ` : ''}

          <!-- Assigned Bartenders -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem;">BARTENDERS</div>
            ${bartendersHtml || '<div style="color: var(--text-muted); font-size: 0.875rem;">No bartenders assigned</div>'}
          </div>

          <!-- Revenue -->
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">REVENUE</div>
            <div style="font-size: 1.25rem; color: var(--green); font-weight: 700;">
              ${fmtMoney(event.revenue || 0)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render upcoming event card (simplified version)
   */
  function renderUpcomingEventCard(event) {
    const eventDate = new Date(event.date);
    const dateStr = fmtDate(eventDate);

    return `
      <div class="card" style="margin-bottom: 1rem; padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1;">
            <h3 style="font-weight: 600; color: #e2e8f0; margin-bottom: 0.25rem;">${event.name}</h3>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">
              ${dateStr} • ${formatTime(event.startTime)} – ${formatTime(event.endTime)}
            </div>
            <div style="font-size: 0.875rem; color: #e2e8f0;">
              ${event.venue} • ${event.guestCount || 0} guests
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: var(--green);">${fmtMoney(event.revenue || 0)}</div>
            <span class="badge" style="background: var(--gold); color: #0D1B2A; font-size: 0.75rem; margin-top: 0.5rem;">${event.eventType}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Update all event displays
   */
  function updateDisplay(events) {
    allEvents = events;

    const todayEvents = events.filter((e) => e.date === todayISO);
    const upcomingEvents = events.filter(
      (e) => e.date > todayISO && new Date(e.date) < sevenDaysLater
    );

    // Update stats
    const totalRevenue = events.reduce((sum, e) => sum + (e.revenue || 0), 0);
    document.querySelector('#stat-today').textContent = todayEvents.length;
    document.querySelector('#stat-week').textContent = todayEvents.length + upcomingEvents.length;
    document.querySelector('#stat-revenue').textContent = fmtMoney(totalRevenue);

    // Render today's events
    if (todayEvents.length === 0) {
      todayContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">No Events Today</div>
          <div class="empty-sub">Check back soon for upcoming bartending gigs!</div>
        </div>
      `;
    } else {
      todayContainer.innerHTML = todayEvents.map((e) => renderEventCard(e)).join('');
    }

    // Render upcoming events
    if (upcomingEvents.length > 0) {
      upcomingSection.style.display = 'block';
      upcomingContainer.innerHTML = upcomingEvents.map((e) => renderUpcomingEventCard(e)).join('');
    } else {
      upcomingSection.style.display = 'none';
    }
  }

  // Load bartenders cache first
  await loadBartendersCache();

  // Set up real-time listener for events
  const unsubscribe = db
    .collection('events')
    .onSnapshot(
      (snapshot) => {
        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })).filter(e => e.status !== 'Cancelled').sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          return (a.startTime || '') < (b.startTime || '') ? -1 : 1;
        });
        updateDisplay(events);
      },
      (error) => {
        console.error('Error fetching events:', error);
        todayContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">Error Loading Events</div>
            <div class="empty-sub">Please refresh the page to try again.</div>
          </div>
        `;
      }
    );

  // Add unsubscribe to global listeners for cleanup
  _activeListeners.push(unsubscribe);
}
