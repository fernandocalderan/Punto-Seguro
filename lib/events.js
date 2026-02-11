const { randomUUID } = require("node:crypto");

async function trackEvent(eventRepository, eventName, payload = {}, context = {}) {
  return eventRepository.append({
    id: randomUUID(),
    event_name: eventName,
    timestamp: new Date().toISOString(),
    payload,
    context,
  });
}

module.exports = {
  trackEvent,
};
