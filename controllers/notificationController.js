const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ msg: 'Notificación no encontrada' });
    
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'No autorizado' });
    }

    notification.read = true;
    await notification.save();
    res.json(notification);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user.id, read: false }, { read: true });
    res.json({ msg: 'Todas las notificaciones marcadas como leídas' });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};
