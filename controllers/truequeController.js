const Trueque = require('../models/Trueque');
const User = require('../models/User');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const TokenService = require('../services/tokenService');

exports.createTrueque = async (req, res) => {
  const { productorB, ofertaA, ofertaB, ajusteTokens, mensaje } = req.body;

  try {
    if (req.user.rolActivo !== 'productor') {
      return res.status(403).json({ msg: 'Solo productores pueden proponer trueques' });
    }

    if (productorB === req.user.id) {
      return res.status(400).json({ msg: 'No puedes proponer un trueque a ti mismo' });
    }

    // Validar tokens si hay ajuste (A paga a B)
    if (ajusteTokens > 0) {
      const userA = await User.findById(req.user.id);
      const pointsNeeded = ajusteTokens * 100;
      if (userA.tokens < pointsNeeded) {
        return res.status(400).json({ msg: 'Fondos insuficientes para proponer este ajuste' });
      }
    }

    const trueque = new Trueque({
      productorA: req.user.id,
      productorB,
      ofertaA,
      ofertaB,
      ajusteTokens: ajusteTokens || 0,
      mensaje,
      creadoPor: req.user.id
    });

    await trueque.save();

    // Notificar al productor B
    await Notification.create({
      recipient: productorB,
      sender: req.user.id,
      type: 'pedido_nuevo', // Reutilizamos tipo o creamos uno nuevo si fuera necesario
      message: `Has recibido una propuesta de trueque de ${req.user.nombre || 'otro productor'}`,
      cta: '/mis-trueques'
    });

    res.json(trueque);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error del servidor');
  }
};

exports.getMisTrueques = async (req, res) => {
  try {
    const trueques = await Trueque.find({
      $or: [{ productorA: req.user.id }, { productorB: req.user.id }]
    })
    .populate('productorA', 'nombre zona')
    .populate('productorB', 'nombre zona')
    .populate('ofertaA.producto', 'nombre precio unidad')
    .populate('ofertaB.producto', 'nombre precio unidad')
    .sort({ createdAt: -1 });

    res.json(trueques);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.updateTruequeEstado = async (req, res) => {
  const { estado } = req.body;
  const validTransitions = {
    'pendiente': ['aceptado', 'rechazado'],
    'aceptado': ['completado'],
    'rechazado': [],
    'completado': []
  };

  try {
    const trueque = await Trueque.findById(req.params.id);
    if (!trueque) return res.status(404).json({ msg: 'Trueque no encontrado' });

    if (!validTransitions[trueque.estado].includes(estado)) {
      return res.status(409).json({ msg: `Transición de ${trueque.estado} a ${estado} no válida` });
    }

    // Solo el receptor (B) puede aceptar/rechazar
    if (['aceptado', 'rechazado'].includes(estado)) {
      if (trueque.productorB.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Solo el destinatario puede responder a la propuesta' });
      }
    }

    // Si se acepta, procesar transferencia de tokens (Fuente de verdad: ajusteTokens * 100)
    if (estado === 'aceptado' && !trueque.tokensTransferidos) {
      const pointsToTransfer = (trueque.ajusteTokens || 0) * 100;

      if (pointsToTransfer !== 0) {
        // Si ajusteTokens > 0: A paga a B. Si < 0: B paga a A.
        const pagadorId = pointsToTransfer > 0 ? trueque.productorA : trueque.productorB;
        const receptorId = pointsToTransfer > 0 ? trueque.productorB : trueque.productorA;
        const absPoints = Math.abs(pointsToTransfer);

        const pagador = await User.findById(pagadorId);
        if (!pagador || pagador.tokens < absPoints) {
          return res.status(400).json({ msg: 'Fondos insuficientes para completar el trueque' });
        }

        // Transferencia atómica usando $inc
        await User.findByIdAndUpdate(pagadorId, { $inc: { tokens: -absPoints } });
        await User.findByIdAndUpdate(receptorId, { $inc: { tokens: absPoints } });
      }

      trueque.tokensTransferidos = true;
    }

    // Si se completa, otorgar premio de +1 a cada uno vía TokenService y actualizar reputación
    if (estado === 'completado') {
      await TokenService.addTokens(trueque.productorA, 1, 'trueque_completado', trueque._id);
      await TokenService.addTokens(trueque.productorB, 1, 'trueque_completado', trueque._id);
      
      const TrustService = require('../services/trustService');
      await TrustService.updateReputation(trueque.productorA);
      await TrustService.updateReputation(trueque.productorB);
    }

    trueque.estado = estado;
    await trueque.save();

    // Notificar a la otra parte
    const recipient = req.user.id === trueque.productorA.toString() ? trueque.productorB : trueque.productorA;
    await Notification.create({
      recipient,
      sender: req.user.id,
      type: 'pedido_aceptado',
      message: `Tu trueque ha sido ${estado}`,
      cta: '/mis-trueques'
    });

    res.json(trueque);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error del servidor');
  }
};
