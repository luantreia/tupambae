const Order = require('../models/Order');
const Producer = require('../models/Producer');
const Notification = require('../models/Notification');
const User = require('../models/User');
const TokenService = require('../services/tokenService');
const { sendEmail } = require('../utils/emailService');

exports.createOrder = async (req, res) => {
  const { productor, items } = req.body;
  try {
    // Validar que el usuario sea consumidor activo
    if (req.user.rolActivo !== 'consumidor') {
      return res.status(403).json({ msg: 'Debes estar en modo consumidor para realizar pedidos' });
    }

    const producerExists = await Producer.findById(productor);
    if (!producerExists) return res.status(404).json({ msg: 'Productor no encontrado' });

    // Validar que el consumidor tenga teléfono cargado
    const user = await User.findById(req.user.id);
    if (!user.telefono) {
      return res.status(400).json({ msg: 'Debes completar tu teléfono en tu perfil para realizar pedidos' });
    }

    // Evitar auto-pedidos
    if (producerExists.user.toString() === req.user.id) {
      return res.status(400).json({ msg: 'No puedes realizar un pedido a tu propio perfil de productor' });
    }

    // Validar que los productos pertenezcan al productor
    const Product = require('../models/Product');
    const productIds = items.map(i => i.producto);
    const products = await Product.find({ _id: { $in: productIds } });

    for (const p of products) {
      if (p.productor.toString() !== productor) {
        return res.status(400).json({ msg: `El producto ${p.nombre} no pertenece al productor seleccionado` });
      }
    }

    // Calcular total y enriquecer items
    let total = 0;
    const enrichedItems = items.map(item => {
      const p = products.find(prod => prod._id.toString() === item.producto.toString());
      const itemPrecio = p ? p.precio : 0;
      const itemCantidad = item.cantidad || 0;
      total += itemPrecio * itemCantidad;
      return {
        producto: p._id,
        nombre: p.nombre,
        precio: itemPrecio,
        cantidad: itemCantidad,
        unidad: p.unidad
      };
    });

    const order = new Order({
      consumidor: req.user.id,
      productor,
      items: enrichedItems,
      total: Number(total.toFixed(2))
    });
    await order.save();
    console.log(`Pedido creado: ${order._id} por usuario ${req.user.id}`);

    // Notificar al productor
    try {
      const consumidor = await User.findById(req.user.id);
      await Notification.create({
        recipient: producerExists.user,
        sender: req.user.id,
        type: 'pedido_nuevo',
        order: order._id,
        message: `Has recibido un nuevo pedido de ${consumidor.nombre} por $${total.toFixed(2)}`,
        cta: '/mis-pedidos'
      });
    } catch (notifErr) {
      console.error('Error al crear notificación:', notifErr);
    }

    res.json(order);
  } catch (err) {
    console.error('Error en createOrder:', err.message);
    res.status(500).json({ msg: 'Error al procesar el pedido. Intente nuevamente.' });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    let orders;
    if (req.user.rolActivo === 'productor') {
      const producer = await Producer.findOne({ user: req.user.id });
      if (!producer) return res.json([]);
      orders = await Order.find({ productor: producer._id })
        .populate('consumidor', 'nombre zona telefono email')
        .sort({ createdAt: -1 });
    } else {
      orders = await Order.find({ consumidor: req.user.id })
        .populate({
          path: 'productor',
          populate: { path: 'user', select: 'nombre' }
        })
        .sort({ createdAt: -1 });
    }
    res.json(orders);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { estado } = req.body;
  const validTransitions = {
    'pendiente': ['aceptado', 'rechazado', 'cancelado'],
    'aceptado': ['completado', 'rechazado', 'cancelado'],
    'rechazado': [],
    'completado': [],
    'cancelado': []
  };

  try {
    let order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Pedido no encontrado' });

    // Validar transición de estado
    if (!validTransitions[order.estado].includes(estado)) {
      return res.status(400).json({ msg: `No se puede pasar de ${order.estado} a ${estado}` });
    }

    // Si es cancelación, puede ser el consumidor o el productor
    if (estado === 'cancelado') {
      const isConsumidor = order.consumidor.toString() === req.user.id;
      const producer = await Producer.findOne({ user: req.user.id });
      const isProductor = producer && order.productor.toString() === producer._id.toString();
      
      if (!isConsumidor && !isProductor) {
        return res.status(401).json({ msg: 'No autorizado para cancelar este pedido' });
      }
    } else {
      // Solo el productor puede aceptar/rechazar/completar
      const producer = await Producer.findOne({ user: req.user.id });
      if (!producer || order.productor.toString() !== producer._id.toString()) {
        return res.status(401).json({ msg: 'No autorizado' });
      }
    }

    order.estado = estado;
    await order.save();

    // Si el pedido se completa, otorgar token al productor y actualizar reputación de ambos
    if (estado === 'completado') {
      const producer = await Producer.findById(order.productor);
      const TrustService = require('../services/trustService');
      
      if (producer) {
        await TokenService.addTokens(producer.user, 1, 'pedido_completado', order._id);
        await TrustService.updateReputation(producer.user);
      }
      
      // También actualizar reputación del consumidor por completar la compra
      await TrustService.updateReputation(order.consumidor);
    }

    // Notificaciones y Emails
    try {
      const consumidor = await User.findById(order.consumidor);
      const productorUser = await User.findById(req.user.id);
      
      let message = '';
      let type = '';
      
      switch(estado) {
        case 'aceptado':
          type = 'pedido_aceptado';
          message = `Tu pedido #${order._id.slice(-6)} ha sido aceptado por ${productorUser.nombre}. Ya puedes ver su contacto.`;
          await sendEmail({
            to: consumidor.email,
            subject: '¡Tu pedido ha sido aceptado! - Tupambaé',
            text: `Hola ${consumidor.nombre}, tu pedido ha sido aceptado por el productor. Ingresa a la app para coordinar la entrega.`,
            html: `<h1>¡Buenas noticias!</h1><p>Tu pedido ha sido aceptado. <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/mis-pedidos">Ver pedido</a></p>`
          });
          break;
        case 'rechazado':
          type = 'pedido_rechazado';
          message = `Lo sentimos, tu pedido #${order._id.slice(-6)} ha sido rechazado.`;
          await sendEmail({
            to: consumidor.email,
            subject: 'Actualización de tu pedido - Tupambaé',
            text: `Hola ${consumidor.nombre}, lamentablemente tu pedido no pudo ser procesado y fue rechazado.`,
            html: `<h1>Actualización de pedido</h1><p>Tu pedido ha sido rechazado. <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/mis-pedidos">Ver detalles</a></p>`
          });
          break;
        case 'completado':
          type = 'pedido_completado';
          message = `¡Pedido #${order._id.slice(-6)} entregado! Gracias por apoyar el comercio local.`;
          break;
        case 'cancelado':
          type = 'pedido_cancelado';
          const isConsumidor = order.consumidor.toString() === req.user.id;
          const recipient = isConsumidor ? order.productor : order.consumidor; // Simplificado, idealmente buscar el User ID del productor
          message = `El pedido #${order._id.slice(-6)} ha sido cancelado.`;
          break;
      }

      if (type) {
        // Si el productor cancela, el recipiente es el consumidor. Si el consumidor cancela, el recipiente es el productor.
        let finalRecipient = order.consumidor;
        if (estado === 'cancelado') {
          const producer = await Producer.findById(order.productor);
          finalRecipient = (req.user.id === order.consumidor.toString()) ? producer.user : order.consumidor;
        }

        await Notification.create({
          recipient: finalRecipient,
          sender: req.user.id,
          type,
          order: order._id,
          message,
          cta: '/mis-pedidos'
        });
      }
    } catch (notifErr) {
      console.error('Error en flujo de notificaciones:', notifErr);
    }

    res.json(order);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};
