const User = require('../models/User');
const TokenLog = require('../models/TokenLog');

class TokenService {
  /**
   * Agrega tokens a un usuario con validaciones de seguridad y límites.
   */
  static async addTokens(userId, amount, reason, referenceId = null) {
    try {
      // Convertir a puntos (1 token = 100 puntos) para evitar decimales
      const points = Math.round(amount * 100);

      // 1. Validar si es una acción de una sola vez
      if (['perfil_completo', 'primera_publicacion'].includes(reason)) {
        const exists = await TokenLog.findOne({ user: userId, reason });
        if (exists) return null;
      }

      // 2. Validar si ya se otorgaron tokens para esta referencia específica (pedido/trueque)
      if (referenceId && ['pedido_completado', 'trueque_completado'].includes(reason)) {
        const exists = await TokenLog.findOne({ user: userId, reason, referenceId });
        if (exists) return null;
      }

      // 3. Límites diarios para spam (publicaciones y actualizaciones)
      if (['producto_publicado', 'producto_actualizado'].includes(reason)) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const count = await TokenLog.countDocuments({ 
          user: userId, 
          reason, 
          createdAt: { $gte: startOfDay } 
        });

        // Límite: 5 publicaciones o 10 actualizaciones por día
        const limit = reason === 'producto_publicado' ? 5 : 10;
        if (count >= limit) return null;
      }

      // 4. Actualizar usuario de forma atómica
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { tokens: points } },
        { new: true }
      );

      if (!user) return null;

      // 5. Registrar log con puntos
      await TokenLog.create({
        user: userId,
        amount: points,
        reason,
        referenceId
      });

      return user.tokens;
    } catch (err) {
      console.error('Error en TokenService:', err);
      return null;
    }
  }

  /**
   * Verifica si el perfil está completo para otorgar el token inicial.
   */
  static async checkProfileCompletion(user) {
    if (user.nombre && user.telefono && user.zona) {
      await this.addTokens(user._id, 1, 'perfil_completo');
    }
  }
}

module.exports = TokenService;
