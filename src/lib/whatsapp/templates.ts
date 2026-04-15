// WhatsApp message templates
export const DEFAULT_TEMPLATES = {
  confirmed: `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`,
  duplicate: `Hi {{name}}, your appointment on {{date}} at {{time}} is already booked. No action needed.`,
  closedDay: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — the clinic is closed on {{dayName}}s. Please choose another date.`,
  holiday: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — it is a holiday. Please choose another date.`,
  closedDate: `Hi {{name}}, sorry the clinic is closed on {{date}}. Please choose another date.`,
  noSlot: `Hi {{name}}, sorry we could not book your appointment at {{time}} on {{date}} — no available slot at that time. Please try a different time.`,
  reminder: `🔔 Reminder: Hi {{name}}, your next visit is tomorrow — {{date}}.\nPlease arrive 10 minutes early. See you soon!`,
  reminderToday: `🔔 Reminder: Hi {{name}}, your appointment is today — {{date}}.\nPlease arrive 10 minutes early. See you soon!`,
};
