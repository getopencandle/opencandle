'use strict';
// The only path by which the renderer asks the OS to show an alert notification. Text only: no icon, URL, action or
// callback crosses the bridge, and the notification is silent because the renderer plays the alert sound itself.
const validation = require('./validation.cjs');
function alertNotificationInput(value) {
  validation.exactKeys(value, ['title', 'body', 'tag']);
  const bounded = (text, limit) => typeof text === 'string' && text.length > 0 && text.length <= limit;
  if (!bounded(value.title, 200) || !bounded(value.body, 2000) || !bounded(value.tag, 200)) throw new validation.BoundaryError('INVALID_ARGUMENT', 'Invalid alert notification text.');
  return { title: value.title, body: value.body, tag: value.tag };
}
function showAlertNotification(Notification, input) {
  if (!Notification || typeof Notification.isSupported !== 'function' || !Notification.isSupported()) return { shown: false };
  new Notification({ title: input.title, body: input.body, silent: true }).show();
  return { shown: true };
}
module.exports = { alertNotificationInput, showAlertNotification };
