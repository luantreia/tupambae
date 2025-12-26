const User = require('../models/User');
const Order = require('../models/Order');
const Trueque = require('../models/Trueque');

/**
 * Calcula el nivel de confianza entre dos usuarios usando BFS (Breadth-First Search)
 * @param {string} startUserId - ID del usuario que consulta
 * @param {string} targetUserId - ID del usuario objetivo
 * @returns {Promise<number>} - Nivel de confianza (1: directo, 2: amigo de amigo, 3: amigo de amigo de amigo, 0: fuera de red)
 */
exports.calculateTrustLevel = async (startUserId, targetUserId) => {
  if (!startUserId || !targetUserId) return 0;
  if (startUserId.toString() === targetUserId.toString()) return 1;

  const queue = [{ id: startUserId, level: 0 }];
  const visited = new Set([startUserId.toString()]);

  while (queue.length > 0) {
    const { id, level } = queue.shift();

    if (level >= 3) continue;

    const user = await User.findById(id).select('contacts');
    if (!user || !user.contacts) continue;

    for (const contactId of user.contacts) {
      const contactStr = contactId.toString();
      if (contactStr === targetUserId.toString()) {
        return level + 1;
      }
      if (!visited.has(contactStr)) {
        visited.add(contactStr);
        queue.push({ id: contactStr, level: level + 1 });
      }
    }
  }

  return 0; // Fuera de la red de 3 niveles
};

/**
 * Actualiza el reputationScore de un usuario basado en su actividad
 * @param {string} userId 
 */
exports.updateReputation = async (userId) => {
  try {
    // 1. Pedidos completados: +5 puntos cada uno
    const completedOrders = await Order.countDocuments({ 
      $or: [
        { 'productor.user': userId }, // Si es productor (vía snapshot)
        { consumidor: userId }        // Si es consumidor
      ],
      estado: 'completado' 
    });

    // 2. Trueques exitosos: +10 puntos cada uno
    const successfulTrueques = await Trueque.countDocuments({
      $or: [
        { productorA: userId },
        { productorB: userId }
      ],
      estado: 'completado'
    });

    // 3. Cálculo final: (Pedidos * 5) + (Trueques * 10)
    // Nota: Las valoraciones se sumarán cuando se implemente el modelo de Review
    const newScore = (completedOrders * 5) + (successfulTrueques * 10);

    await User.findByIdAndUpdate(userId, { reputationScore: newScore });
    console.log(`[Reputation] User ${userId} updated to ${newScore} points`);
    return newScore;
  } catch (err) {
    console.error('Error updating reputation:', err);
  }
};
