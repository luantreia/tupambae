const User = require('../models/User');
const Product = require('../models/Product');
const Producer = require('../models/Producer');
const TokenService = require('../services/tokenService');
const mongoose = require('mongoose');

exports.updateMe = async (req, res) => {
  const { nombre, email, telefono, zona } = req.body;
  
  try {
    let user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

    // Si cambia el email, verificar que no esté en uso
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) return res.status(400).json({ msg: 'El email ya está en uso' });
      user.email = email;
    }

    if (nombre) user.nombre = nombre;
    if (telefono) user.telefono = telefono;
    if (zona) user.zona = zona;

    await user.save();

    // Verificar si el perfil está completo para otorgar token
    await TokenService.checkProfileCompletion(user);

    // Volver a buscar para obtener tokens actualizados si se otorgaron
    const updatedUser = await User.findById(user.id);

    return res.status(200).json({
      id: updatedUser.id,
      nombre: updatedUser.nombre,
      email: updatedUser.email,
      rolActivo: updatedUser.rolActivo,
      roles: updatedUser.roles,
      zona: updatedUser.zona,
      telefono: updatedUser.telefono,
      tokens: updatedUser.tokens,
      isSelecto: updatedUser.isSelecto,
      reputationScore: updatedUser.reputationScore
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Error del servidor al actualizar el perfil' });
  }
};

exports.deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.params.id;

    // 1. Verificar permisos (solo el propio usuario o un admin si existiera)
    if (req.user.id !== userId) {
      return res.status(403).json({ msg: 'No autorizado para eliminar esta cuenta' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    // 2. Soft Delete del Usuario
    user.activo = false;
    // Ofuscar datos sensibles si se desea (opcional para soft delete)
    // user.email = `deleted_${Date.now()}_${user.email}`; 
    await user.save({ session });

    // 3. Desactivar Perfil de Productor y sus Productos (si aplica)
    const producer = await Producer.findOne({ user: userId }).session(session);
    if (producer) {
      // Desactivar todos sus productos para que no aparezcan en el mapa/listas
      await Product.updateMany(
        { productor: producer._id },
        { $set: { disponible: false } }
      ).session(session);
      
      // Opcional: marcar productor como inactivo
      // producer.activo = false;
      // await producer.save({ session });
    }

    // 4. Mantener Pedidos y Trueques (Integridad Referencial)
    // No se eliminan para que la otra parte (consumidor/productor) mantenga su historial.
    // El middleware de auth ya bloqueará cualquier acción futura del usuario desactivado.

    await session.commitTransaction();
    session.endSession();

    res.json({ msg: 'Cuenta desactivada correctamente y datos relacionados ocultos' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error en deleteUser:', err);
    res.status(500).send('Error del servidor al eliminar usuario');
  }
};

exports.addContact = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const contactId = req.params.contactId;

    if (user.contacts.includes(contactId)) {
      return res.status(400).json({ msg: 'El usuario ya está en tus contactos' });
    }

    user.contacts.push(contactId);
    await user.save();
    res.json(user.contacts);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.removeContact = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.contacts = user.contacts.filter(c => c.toString() !== req.params.contactId);
    await user.save();
    res.json(user.contacts);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.updateVisibilidad = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });
    
    user.isSelecto = !user.isSelecto;
    await user.save();
    
    res.json({ 
      msg: `Visibilidad actualizada a ${user.isSelecto ? 'Selecto' : 'Público'}`,
      isSelecto: user.isSelecto 
    });
  } catch (err) {
    console.error('Error en updateVisibilidad:', err);
    res.status(500).json({ msg: 'Error al actualizar la visibilidad' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 3) return res.json([]);

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } },
        { activo: true },
        {
          $or: [
            { nombre: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).select('nombre email zona reputationScore');

    res.json(users);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.getContacts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('contacts', 'nombre email zona reputationScore');
    
    const TrustService = require('../services/trustService');
    const contactsWithTrust = await Promise.all(user.contacts.map(async (c) => {
      const trustLevel = await TrustService.calculateTrustLevel(req.user.id, c._id);
      return { ...c.toObject(), trustLevel };
    }));

    res.json(contactsWithTrust);
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id)
      .select('nombre email zona telefono reputationScore isSelecto contacts');
    
    if (!targetUser) return res.status(404).json({ msg: 'Usuario no encontrado' });

    const TrustService = require('../services/trustService');
    const userId = req.user ? req.user.id : null;
    const trustLevel = await TrustService.calculateTrustLevel(userId, targetUser._id);

    // Lógica de visibilidad:
    // 1. Si NO es selecto (es público), se muestra.
    // 2. Si no tiene contactos, se muestra como público (fallback).
    // 3. Si es selecto, debe estar en la red de confianza (trustLevel > 0).
    const isVisible = !targetUser.isSelecto || 
                      (targetUser.contacts && targetUser.contacts.length === 0) || 
                      trustLevel > 0;

    if (!isVisible) {
      return res.status(403).json({ 
        msg: 'Perfil privado. Solo visible para contactos de confianza.',
        trustLevel: 0 
      });
    }

    res.json({
      ...targetUser.toObject(),
      trustLevel
    });
  } catch (err) {
    console.error('Error en getUserProfile:', err);
    res.status(500).send('Error del servidor');
  }
};
